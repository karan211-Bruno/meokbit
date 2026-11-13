import React, { useState } from 'react';
import { AiSettings, NoteBook, ScheduleEvent, TodoTask } from '../types';
import {
  parseScheduleFromUtterance,
  runAiAskOrLasso,
  runAiDocumentDraft,
  runAiMeetingSummary,
} from '../lib/aiAssistant';

interface AiAidSheetProps {
  open: boolean;
  onClose: () => void;
  activeNote: NoteBook | null;
  settings: AiSettings;
  onUpdateSettings: (next: AiSettings) => void;
  initialPrompt?: string;
  initialLassoImage?: string;
  onInsertToNote: (text: string) => void;
  onAddTodo: (todo: TodoTask) => void;
  onAddEvent: (ev: ScheduleEvent) => void;
  onUpdateNoteSummary: (summary: string) => void;
}

type AiTab = 'summary' | 'draft' | 'ask' | 'voice-cmd' | 'provider';

export const AiAidSheet: React.FC<AiAidSheetProps> = ({
  open,
  onClose,
  activeNote,
  settings,
  onUpdateSettings,
  initialPrompt,
  initialLassoImage,
  onInsertToNote,
  onAddTodo,
  onAddEvent,
  onUpdateNoteSummary,
}) => {
  const [tab, setTab] = useState<AiTab>(initialPrompt ? 'ask' : 'summary');
  const [topic, setTopic] = useState('');
  const [draftKind, setDraftKind] = useState<'meeting' | 'report' | 'study' | 'email'>('report');
  const [question, setQuestion] = useState(initialPrompt || '');
  const [voiceCmd, setVoiceCmd] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const currentPage = activeNote?.pages[activeNote.currentPage];
  const noteContext = [
    activeNote?.title || '',
    currentPage?.textLayer || '',
    ...(activeNote?.recordings.flatMap((r) => r.segments.map((s) => `${s.speaker}: ${s.text}`)) ||
      []),
  ]
    .filter(Boolean)
    .join('\n');

  const handleRunSummary = async () => {
    if (!activeNote) return;
    setBusy(true);
    try {
      const segments = activeNote.recordings.flatMap((r) => r.segments);
      const result = await runAiMeetingSummary(
        settings,
        activeNote.title,
        currentPage?.textLayer || '',
        segments
      );
      setOutput(result.summaryMarkdown);
      onUpdateNoteSummary(result.summaryMarkdown);
      for (const title of result.extractedTodos) {
        onAddTodo({
          id: `td_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          title,
          done: false,
          sourceNoteId: activeNote.id,
          createdAt: Date.now(),
        });
      }
      for (const ev of result.extractedEvents) {
        onAddEvent({
          id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          title: ev.title,
          date: ev.date,
          time: ev.time,
          notes: 'AI 회의 요약에서 자동 추출',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRunDraft = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      const result = await runAiDocumentDraft(settings, topic.trim(), draftKind, noteContext);
      setOutput(result);
    } finally {
      setBusy(false);
    }
  };

  const handleRunAsk = async () => {
    if (!question.trim()) return;
    setBusy(true);
    try {
      const result = await runAiAskOrLasso(
        settings,
        question.trim(),
        noteContext,
        initialLassoImage
      );
      setOutput(result);
    } finally {
      setBusy(false);
    }
  };

  const handleRunVoiceCommand = async () => {
    const raw = voiceCmd.trim();
    if (!raw) return;
    setBusy(true);
    try {
      const isScheduleCmd = /일정|등록|추가|예약|회의|미팅|내일|모레|\d{1,2}시|\d{1,2}월/.test(raw);
      const parsed = isScheduleCmd ? parseScheduleFromUtterance(raw) : null;
      if (parsed) {
        const ev: ScheduleEvent = {
          id: `ev_${Date.now()}`,
          title: parsed.title,
          date: parsed.date,
          time: parsed.time,
          notes: parsed.notes,
        };
        onAddEvent(ev);
        onAddTodo({
          id: `todo_${Date.now()}`,
          title: `[일정] ${parsed.title} (${parsed.date} ${parsed.time})`,
          done: false,
          dueDate: parsed.date,
          sourceNoteId: activeNote?.id,
          createdAt: Date.now(),
        });
        setOutput(
          `일정과 할 일에 등록했습니다:\n- 제목: ${parsed.title}\n- 날짜: ${parsed.date} ${parsed.time}`
        );
      } else {
        const ans = await runAiAskOrLasso(settings, raw, noteContext);
        setOutput(ans);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="먹빛 AI 에이드">
      <div className="modal-card ai-aid-modal">
        <div className="modal-header">
          <div>
            <h2>AI 에이드 (AI Aid & 문서 작성)</h2>
            <p className="modal-sub">
              제공자: {settings.provider.toUpperCase()} ({settings.model || '내장 로컬 엔진'})
            </p>
          </div>
          <button type="button" className="btn-ghost-sm" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="ai-tab-row">
          <button
            type="button"
            className={tab === 'summary' ? 'is-active' : ''}
            onClick={() => setTab('summary')}
          >
            회의·노트 요약
          </button>
          <button
            type="button"
            className={tab === 'draft' ? 'is-active' : ''}
            onClick={() => setTab('draft')}
          >
            AI 문서 작성
          </button>
          <button
            type="button"
            className={tab === 'ask' ? 'is-active' : ''}
            onClick={() => setTab('ask')}
          >
            올가미/질문
          </button>
          <button
            type="button"
            className={tab === 'voice-cmd' ? 'is-active' : ''}
            onClick={() => setTab('voice-cmd')}
          >
            AI 버튼(음성 일정)
          </button>
          <button
            type="button"
            className={tab === 'provider' ? 'is-active' : ''}
            onClick={() => setTab('provider')}
          >
            AI 연결 설정
          </button>
        </div>

        <div className="ai-body">
          {tab === 'summary' && (
            <div className="ai-panel">
              <p>
                현재 노트의 텍스트, 음성 전사 세그먼트, 체크 포인트를 묶어 AINOTE 2 스타일의
                구조화된 회의록/학습 요약본을 생성합니다.
              </p>
              <button
                type="button"
                className="btn-ink"
                onClick={handleRunSummary}
                disabled={busy || !activeNote}
              >
                {busy ? '요약 생성 중...' : '현재 노트 AI 요약 실행'}
              </button>
            </div>
          )}

          {tab === 'draft' && (
            <div className="ai-panel">
              <div className="form-row">
                <label>
                  문서 종류
                  <select
                    value={draftKind}
                    onChange={(e) =>
                      setDraftKind(e.target.value as 'meeting' | 'report' | 'study' | 'email')
                    }
                  >
                    <option value="report">기획 보고서 (Markdown)</option>
                    <option value="meeting">공식 회의록</option>
                    <option value="email">업무 회신 이메일</option>
                    <option value="study">학습 노트 / 퀴즈</option>
                  </select>
                </label>
                <label>
                  작성 주제
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="예: 3분기 디스플레이 전환 기술 검토 보고"
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-ink"
                onClick={handleRunDraft}
                disabled={busy || !topic.trim()}
              >
                {busy ? '문서 작성 중...' : 'AI 문서 초안 생성'}
              </button>
            </div>
          )}

          {tab === 'ask' && (
            <div className="ai-panel">
              {initialLassoImage && (
                <div className="lasso-preview-box">
                  <img src={initialLassoImage} alt="선택한 손글씨 영역" />
                </div>
              )}
              <label>
                질문 또는 변환 요청
                <textarea
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="예: 선택한 손글씨를 마크다운으로 정리해 줘 / 핵심 논점 3가지 알려줘"
                />
              </label>
              <button
                type="button"
                className="btn-ink"
                onClick={handleRunAsk}
                disabled={busy || !question.trim()}
              >
                {busy ? '분석 중...' : 'AI 질문 실행'}
              </button>
            </div>
          )}

          {tab === 'voice-cmd' && (
            <div className="ai-panel">
              <p>
                상단 AI 물리 버튼 시뮬레이터입니다. 일정을 말하거나 입력하면 캘린더(.ics)와
                To-Do에 자동 등록하고, 일반 질문에는 즉시 답변합니다.
              </p>
              <div className="form-inline">
                <input
                  type="text"
                  value={voiceCmd}
                  onChange={(e) => setVoiceCmd(e.target.value)}
                  placeholder="예: 내일 오후 3시 디자인 리뷰 일정 추가해줘"
                />
                <button
                  type="button"
                  className="btn-ink"
                  onClick={handleRunVoiceCommand}
                  disabled={busy || !voiceCmd.trim()}
                >
                  실행
                </button>
              </div>
            </div>
          )}

          {tab === 'provider' && (
            <div className="ai-panel">
              <div className="form-grid-2">
                <label>
                  AI 백엔드
                  <select
                    value={settings.provider}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        provider: e.target.value as AiSettings['provider'],
                      })
                    }
                  >
                    <option value="local">오프라인 로컬 엔진 (무료/즉시 동작)</option>
                    <option value="openai">OpenAI Compatible (gpt-5 등)</option>
                    <option value="gemini">Google Gemini API</option>
                    <option value="custom">사용자 지정 OpenAI 엔드포인트</option>
                  </select>
                </label>
                <label>
                  모델 이름
                  <input
                    type="text"
                    value={settings.model}
                    onChange={(e) => onUpdateSettings({ ...settings, model: e.target.value })}
                    placeholder="gpt-5 또는 gemini-2.5-flash"
                  />
                </label>
                <label>
                  API 키 (기기 로컬 저장)
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => onUpdateSettings({ ...settings, apiKey: e.target.value })}
                    placeholder="sk-... 또는 AIza..."
                  />
                </label>
                <label>
                  커스텀 Base URL (선택)
                  <input
                    type="text"
                    value={settings.baseUrl}
                    onChange={(e) => onUpdateSettings({ ...settings, baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
              </div>
            </div>
          )}

          {output && (
            <div className="ai-output-box">
              <div className="ai-output-head">
                <strong>AI 결과</strong>
                <div className="ai-output-actions">
                  <button
                    type="button"
                    className="btn-outline-sm"
                    onClick={() => onInsertToNote(output)}
                  >
                    현재 노트에 삽입
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(output).catch(() => undefined);
                    }}
                  >
                    복사
                  </button>
                </div>
              </div>
              <pre>{output}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
