import type { AiSettings, MindNode, ScheduleEvent, TranscriptSegment } from '../types';

export interface MeetingSummaryResult {
  summaryMarkdown: string;
  extractedTodos: string[];
  extractedEvents: Array<{ title: string; date: string; time: string }>;
}

async function callRemoteChat(
  settings: AiSettings,
  prompt: string,
  imageDataUrl?: string,
): Promise<string | null> {
  if (settings.provider === 'local' || !settings.apiKey.trim()) return null;

  if (settings.provider === 'gemini') {
    const model = settings.model || 'gemini-2.5-flash';
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (imageDataUrl && imageDataUrl.includes(',')) {
      const [meta, b64] = imageDataUrl.split(',');
      const mime = meta.match(/data:(.*?);/)?.[1] || 'image/png';
      parts.push({ inlineData: { mimeType: mime, data: b64 } });
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API 오류 (${res.status})`);
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  // OpenAI or OpenAI-compatible (Ollama/vLLM/Custom)
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
  if (imageDataUrl) {
    content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-5',
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`AI API 오류 (${res.status})`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() || null;
}

export function parseScheduleFromUtterance(text: string): Omit<ScheduleEvent, 'id'> | null {
  const clean = text.trim();
  if (!clean) return null;

  const now = new Date();
  let targetDate = new Date(now);
  if (/내일|tomorrow|明日/i.test(clean)) {
    targetDate.setDate(now.getDate() + 1);
  } else if (/모레/.test(clean)) {
    targetDate.setDate(now.getDate() + 2);
  } else {
    const iso = clean.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const md = clean.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (iso) {
      targetDate = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    } else if (md) {
      targetDate = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    }
  }

  let hour = 10;
  let min = 0;
  const hm = clean.match(/(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/i);
  if (hm) {
    hour = Number(hm[2]);
    min = hm[3] ? Number(hm[3]) : 0;
    const ampm = (hm[1] || '').toUpperCase();
    if ((ampm === '오후' || ampm === 'PM') && hour < 12) hour += 12;
    if ((ampm === '오전' || ampm === 'AM') && hour === 12) hour = 0;
  }

  const title = clean
    .replace(/(오늘|내일|모레|오전|오후|\d{1,2}시\s*\d{0,2}분?|\d{1,2}:\d{2}|\d{1,2}월\s*\d{1,2}일|등록해\s*줘|추가해\s*줘|일정)/g, '')
    .trim();

  return {
    title: title || clean,
    date: targetDate.toISOString().slice(0, 10),
    time: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    notes: `음성/텍스트 자동 등록: ${clean}`,
  };
}

function offlineSummarizeMeeting(
  title: string,
  noteText: string,
  segments: TranscriptSegment[],
): MeetingSummaryResult {
  const combined = [
    ...segments.map((s) => `${s.speaker}: ${s.text}`),
    ...noteText.split(/\n+/).filter((l) => l.trim().length > 0),
  ];

  const keyLines = combined
    .filter((l) => l.trim().length > 8)
    .slice(0, 5)
    .map((l) => `- ${l.trim()}`);

  const todoCandidates = combined
    .filter((l) => /확인|점검|준비|공유|완료|부탁|까지|해야|할\s*일|TODO|action/i.test(l))
    .map((l) => l.replace(/^[^:]+:\s*/, '').trim())
    .slice(0, 4);

  const extractedEvents: Array<{ title: string; date: string; time: string }> = [];
  for (const line of combined) {
    if (/(오전|오후|\d{1,2}시|\d{1,2}월\s*\d{1,2}일|내일|모레)/.test(line)) {
      const ev = parseScheduleFromUtterance(line);
      if (ev) extractedEvents.push({ title: ev.title, date: ev.date, time: ev.time });
    }
  }

  const summaryMarkdown = [
    `## ${title} — AI 회의 적요`,
    '',
    '### 1. 핵심 요약',
    keyLines.length > 0 ? keyLines.join('\n') : '- 기록된 본문 및 전사 내용을 바탕으로 핵심 논의를 정리했습니다.',
    '',
    '### 2. 실행 과제 (Action Items)',
    ...(todoCandidates.length > 0
      ? todoCandidates.map((t) => `- [ ] ${t}`)
      : ['- [ ] 후속 검토 일정 확정 및 공유']),
  ].join('\n');

  return {
    summaryMarkdown,
    extractedTodos: todoCandidates.length > 0 ? todoCandidates : ['회의 후속 조치 점검'],
    extractedEvents,
  };
}

export async function runAiMeetingSummary(
  settings: AiSettings,
  title: string,
  noteText: string,
  segments: TranscriptSegment[],
): Promise<MeetingSummaryResult> {
  const transcriptStr = segments.map((s) => `[${s.speaker}] ${s.text}`).join('\n');
  const prompt = `다음 회의 제목, 메모, 음성 전사 내용을 한국어 마크다운으로 간결하게 요약하고 핵심 결정과 할 일(체크리스트 - [ ])을 정리해 주세요.\n\n제목: ${title}\n메모:\n${noteText}\n전사:\n${transcriptStr}`;
  try {
    const remote = await callRemoteChat(settings, prompt);
    if (remote) {
      const todos = remote
        .split('\n')
        .filter((l) => /^\s*-\s*\[\s*\]/.test(l))
        .map((l) => l.replace(/^\s*-\s*\[\s*\]\s*/, '').trim());
      return {
        summaryMarkdown: remote,
        extractedTodos: todos,
        extractedEvents: [],
      };
    }
  } catch {
    // Fallback cleanly to local summary engine
  }
  return offlineSummarizeMeeting(title, noteText, segments);
}

export async function runAiDocumentDraft(
  settings: AiSettings,
  topic: string,
  kind: 'meeting' | 'report' | 'study' | 'email',
  contextText: string,
): Promise<string> {
  const kindLabel =
    kind === 'meeting'
      ? '회의록'
      : kind === 'report'
        ? '업무 보고서'
        : kind === 'study'
          ? '학습 요약 노트'
          : '비즈니스 이메일 초안';
  const prompt = `주제 "${topic}"에 대한 ${kindLabel}을(를) 마크다운으로 작성해 주세요.\n참고 메모:\n${contextText}`;
  try {
    const remote = await callRemoteChat(settings, prompt);
    if (remote) return remote;
  } catch {
    // fallback
  }

  const today = new Date().toISOString().slice(0, 10);
  const bullets = contextText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);

  return [
    `# ${topic || '제목 없음'} (${kindLabel})`,
    `작성일: ${today}`,
    '',
    '## 1. 배경 및 목적',
    `- 본 문서는 "${topic || '핵심 안건'}"의 핵심 내용과 실행 계획을 정리한 ${kindLabel}입니다.`,
    '',
    '## 2. 주요 내용',
    ...(bullets.length > 0 ? bullets.map((b) => `- ${b}`) : ['- 핵심 안건 정리 및 세부 실행 방안 검토']),
    '',
    '## 3. 향후 일정 및 요청 사항',
    '- 관련 담당자 검토 후 최종 일정 확정',
  ].join('\n');
}

export async function runAiAskOrLasso(
  settings: AiSettings,
  question: string,
  contextText: string,
  lassoImageDataUrl?: string,
): Promise<string> {
  const prompt = `사용자 질문: ${question}\n노트/문서 문맥:\n${contextText || '(손글씨 선택 영역 이미지 참고)'}\n한국어로 명확하고 간결하게 답해 주세요.`;
  try {
    const remote = await callRemoteChat(settings, prompt, lassoImageDataUrl);
    if (remote) return remote;
  } catch (err) {
    return `원격 AI 연결에 실패해 오프라인 분석 결과를 표시합니다.\n(${err instanceof Error ? err.message : '오류'})`;
  }

  if (lassoImageDataUrl) {
    return [
      '선택한 필기 영역을 분석했습니다 (오프라인 모드).',
      '• 이 영역을 [마크다운 변환] 또는 [업무 추가]로 바로 옮길 수 있습니다.',
      '• 설정에서 OpenAI(GPT-5) 또는 Gemini API 키를 입력하면 손글씨 수식·외국어까지 정밀 비전 해독이 가능합니다.',
    ].join('\n');
  }

  const sentences = contextText
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  const qWords = question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const matched = sentences.filter((s) => qWords.some((w) => s.toLowerCase().includes(w)));
  const picks = (matched.length > 0 ? matched : sentences).slice(0, 3);

  return picks.length > 0
    ? `노트 문맥 기반 답변:\n${picks.map((p) => `• ${p}`).join('\n')}`
    : `"${question}"에 대해 현재 노트에 관련 텍스트가 적습니다. 필기를 텍스트로 변환하거나 설정에서 GPT-5/Gemini 키를 연결해 보세요.`;
}

export async function runAiMindMapGenerate(
  settings: AiSettings,
  topic: string,
  contextText: string,
): Promise<MindNode[]> {
  const prompt = `"${topic}" 주제로 마인드맵을 만들기 위해 하위 핵심 분기 4개를 한 줄에 하나씩(번호 없이) 써 주세요.\n참고:\n${contextText}`;
  let branches: string[] = [];
  try {
    const remote = await callRemoteChat(settings, prompt);
    if (remote) {
      branches = remote
        .split('\n')
        .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 4);
    }
  } catch {
    // fallback
  }

  if (branches.length < 2) {
    const lines = contextText
      .split(/\n+/)
      .map((l) => l.replace(/^[-*•\s]+/, '').trim())
      .filter((l) => l.length > 2)
      .slice(0, 4);
    branches =
      lines.length >= 2
        ? lines
        : ['핵심 개념 정리', '주요 근거·자료', '실행 과제', '후속 일정'];
  }

  const coords = [
    [170, 120],
    [680, 120],
    [170, 330],
    [680, 330],
  ];

  return [
    { id: 'mm-root', label: topic || '핵심 주제', parentId: null, x: 425, y: 225 },
    ...branches.map((b, i) => ({
      id: `mm-b-${i + 1}`,
      label: b.slice(0, 26),
      parentId: 'mm-root',
      x: coords[i % 4][0],
      y: coords[i % 4][1],
    })),
  ];
}

export interface StructuredMeetingMinutes {
  title: string;
  dateLabel: string;
  attendees: string[];
  agenda: string[];
  discussionPoints: Array<{ heading: string; bullets: string[] }>;
  quote?: string;
  itemsToConfirm: string[];
  actionItems: Array<{ owner: string; task: string; due?: string }>;
  markdown: string;
}

export async function runFullMeetingMinutes(
  settings: AiSettings,
  title: string,
  noteText: string,
  segments: TranscriptSegment[],
): Promise<StructuredMeetingMinutes> {
  const speakers = Array.from(
    new Set(segments.map((s) => s.speaker.trim()).filter(Boolean)),
  );
  const attendees = speakers.length > 0 ? speakers : ['Speaker 1', 'Speaker 2'];
  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const summary = await runAiMeetingSummary(settings, title, noteText, segments);

  const noteLines = noteText
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\[\]\s]+/, '').trim())
    .filter((l) => l.length > 2);

  const agenda = noteLines.length > 0
    ? noteLines.slice(0, 3)
    : ['핵심 프로젝트 진행 현황 점검', '실시간 음성 전사 및 필기 동기화 검토', '향후 마일스톤 및 일정 확정'];

  const discussionPoints: Array<{ heading: string; bullets: string[] }> = [];
  if (segments.length > 0) {
    const bySpeaker = new Map<string, string[]>();
    for (const seg of segments) {
      const list = bySpeaker.get(seg.speaker) || [];
      list.push(seg.text);
      bySpeaker.set(seg.speaker, list);
    }
    Array.from(bySpeaker.entries()).forEach(([speaker, lines]) => {
      discussionPoints.push({
        heading: `${speaker} 주요 발언`,
        bullets: lines.slice(0, 3),
      });
    });
  } else {
    discussionPoints.push({
      heading: '주요 논의 사항',
      bullets: agenda,
    });
  }

  const quote = segments[0]?.text
    ? `"${segments[0].text}" — ${segments[0].speaker}`
    : undefined;

  const itemsToConfirm = summary.extractedEvents.length > 0
    ? summary.extractedEvents.map((ev) => `${ev.title} (${ev.date} ${ev.time}) 일정 최종 확인`)
    : ['차기 리뷰 회의 시간 및 공유 대상 최종 확인'];

  const actionItems = summary.extractedTodos.map((t, idx) => ({
    owner: attendees[idx % attendees.length] || '담당자',
    task: t,
    due: idx === 0 ? '오늘 중' : '이번 주 내',
  }));

  const mdLines = [
    `# Meeting Minutes — ${title}`,
    `- **Date**: ${dateLabel}`,
    `- **Attendees**: ${attendees.join(', ')}`,
    '',
    '## Agenda',
    ...agenda.map((a) => `- ${a}`),
    '',
    '## Key Discussion Points',
    ...discussionPoints.flatMap((dp) => [`### ${dp.heading}`, ...dp.bullets.map((b) => `- ${b}`), '']),
    ...(quote ? [`> ${quote}`, ''] : []),
    '## Items to be Confirmed',
    ...itemsToConfirm.map((c) => `- [ ] ${c}`),
    '',
    '## Action Items',
    ...actionItems.map((ai) => `- [ ] **${ai.owner}**: ${ai.task}${ai.due ? ` (${ai.due})` : ''}`),
  ];

  return {
    title,
    dateLabel,
    attendees,
    agenda,
    discussionPoints,
    quote,
    itemsToConfirm,
    actionItems,
    markdown: mdLines.join('\n'),
  };
}

const SAMPLE_GLOSSARY: Array<{ re: RegExp; en: string; ko: string; ja: string; zh: string }> = [
  {
    re: /전략|계획|목표|core|focus/i,
    en: 'Synchronized voice-and-ink capture with speaker identification and timestamp jump.',
    ko: '화자 구분 및 타임스탬프 이동을 지원하는 실시간 음성·필기 동기화 기록.',
    ja: '話者識別とタイムスタンプ移動に対応したリアルタイム音声・手書き同期記録。',
    zh: '支持说话人识别与时间戳跳转的实时语音手写同步记录。',
  },
  {
    re: /올가미|마크다운|AI|summary|todo/i,
    en: 'Circle handwritten keywords with the lasso tool to summarize or send to action items.',
    ko: '올가미로 손글씨를 감싸 AI 회의 적요 요약 또는 할 일 목록에 바로 추가합니다.',
    ja: '投げ縄で手書きを囲み、AI要約またはTo-Doへ直接追加します。',
    zh: '使用套索圈选手写内容，即可由AI整理纪要或直接加入待办事项。',
  },
  {
    re: /일정|캘린더|내일|오후|3시|schedule|calendar/i,
    en: 'Confirm action items, attendees, and calendar schedule export before tomorrow 3 PM.',
    ko: '내일 오후 3시 전까지 참석자별 실행 과제 및 캘린더(.ics) 내보내기를 확정합니다.',
    ja: '明日午後3時までに担当者別アクション項目とカレンダー(.ics)出力を確定します。',
    zh: '请在明天下午3点前确认各参会人待办事项及日历(.ics)导出。',
  },
];

export function quickTranslateLine(text: string, targetLang: string): string {
  if (!text.trim()) return '';
  const hit = SAMPLE_GLOSSARY.find((g) => g.re.test(text));
  if (hit) {
    if (targetLang === 'en') return hit.en;
    if (targetLang === 'ko') return hit.ko;
    if (targetLang === 'ja') return hit.ja;
    if (targetLang === 'zh') return hit.zh;
  }
  const tag =
    targetLang === 'en'
      ? 'EN'
      : targetLang === 'ja'
        ? 'JA'
        : targetLang === 'zh'
          ? 'ZH'
          : targetLang.toUpperCase();
  return `[${tag}] ${text}`;
}
