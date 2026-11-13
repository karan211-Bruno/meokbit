import { openDB, type IDBPDatabase } from 'idb';
import type {
  AiSettings,
  ExportedAudioFile,
  InkStroke,
  MindMapDoc,
  NoteBook,
  ScheduleEvent,
  TodoTask,
} from '../types';
import { createDemoMeetingWavDataUrl } from './audioExport';

const DB_NAME = 'meokbit-db';
const DB_VERSION = 2;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'local',
  apiKey: '',
  model: 'gpt-5',
  baseUrl: 'https://api.openai.com/v1',
  readingLight: 0,
  speechLang: 'ko-KR',
  translateLang: 'en',
  translationMode: 'both',
  savedTranslationPairs: [
    {
      id: 'pair-ko-en',
      sourceCode: 'ko-KR',
      sourceLabel: '한국어',
      targetCode: 'en',
      targetLabel: 'English',
    },
    {
      id: 'pair-ja-en',
      sourceCode: 'ja-JP',
      sourceLabel: '日本語',
      targetCode: 'en',
      targetLabel: 'English',
    },
  ],
  showSyncMarkers: true,
  clickToSpeak: true,
  splitPaneHeight: 236,
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('todos')) db.createObjectStore('todos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('mindmaps')) db.createObjectStore('mindmaps', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('audioFiles')) db.createObjectStore('audioFiles', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function loadAiSettings(): Promise<AiSettings> {
  try {
    const db = await getDb();
    const rec = await db.get('prefs', 'aiSettings');
    if (rec?.value) {
      return {
        ...DEFAULT_AI_SETTINGS,
        ...rec.value,
        savedTranslationPairs:
          Array.isArray(rec.value.savedTranslationPairs) && rec.value.savedTranslationPairs.length > 0
            ? rec.value.savedTranslationPairs
            : DEFAULT_AI_SETTINGS.savedTranslationPairs,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_AI_SETTINGS };
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  const db = await getDb();
  await db.put('prefs', { key: 'aiSettings', value: settings });
}

export async function listNotes(): Promise<NoteBook[]> {
  const db = await getDb();
  const list = (await db.getAll('notes')) as NoteBook[];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveNote(note: NoteBook): Promise<void> {
  const db = await getDb();
  await db.put('notes', { ...note, updatedAt: Date.now() });
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('notes', id);
}

export async function listTodos(): Promise<TodoTask[]> {
  const db = await getDb();
  const list = (await db.getAll('todos')) as TodoTask[];
  return list.sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
}

export async function saveTodo(todo: TodoTask): Promise<void> {
  const db = await getDb();
  await db.put('todos', todo);
}

export async function deleteTodo(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('todos', id);
}

export async function listEvents(): Promise<ScheduleEvent[]> {
  const db = await getDb();
  const list = (await db.getAll('events')) as ScheduleEvent[];
  return list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export async function saveEvent(ev: ScheduleEvent): Promise<void> {
  const db = await getDb();
  await db.put('events', ev);
}

export async function deleteEvent(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('events', id);
}

export async function listMindMaps(): Promise<MindMapDoc[]> {
  const db = await getDb();
  const list = (await db.getAll('mindmaps')) as MindMapDoc[];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveMindMap(doc: MindMapDoc): Promise<void> {
  const db = await getDb();
  await db.put('mindmaps', { ...doc, updatedAt: Date.now() });
}

export async function deleteMindMap(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('mindmaps', id);
}

export async function listAudioFiles(): Promise<ExportedAudioFile[]> {
  const db = await getDb();
  const list = (await db.getAll('audioFiles')) as ExportedAudioFile[];
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveAudioFile(file: ExportedAudioFile): Promise<void> {
  const db = await getDb();
  await db.put('audioFiles', file);
}

export async function deleteAudioFile(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('audioFiles', id);
}

export async function exportMeokbitBackup(): Promise<string> {
  const [notes, todos, events, mindmaps, audioFiles, settings] = await Promise.all([
    listNotes(),
    listTodos(),
    listEvents(),
    listMindMaps(),
    listAudioFiles(),
    loadAiSettings(),
  ]);
  return JSON.stringify(
    {
      app: 'meokbit',
      version: '2.0.0',
      settings: { ...settings, apiKey: '' },
      notes,
      todos,
      events,
      mindmaps,
      audioFiles,
    },
    null,
    2,
  );
}

export async function importMeokbitBackup(raw: string): Promise<number> {
  const data = JSON.parse(raw) as {
    notes?: NoteBook[];
    todos?: TodoTask[];
    events?: ScheduleEvent[];
    mindmaps?: MindMapDoc[];
    audioFiles?: ExportedAudioFile[];
  };
  let total = 0;
  for (const n of data.notes || []) {
    await saveNote(n);
    total++;
  }
  for (const t of data.todos || []) await saveTodo(t);
  for (const e of data.events || []) await saveEvent(e);
  for (const m of data.mindmaps || []) await saveMindMap(m);
  for (const a of data.audioFiles || []) await saveAudioFile(a);
  return total;
}

function makeWordStroke(
  id: string,
  points: Array<[number, number, number]>,
  recId: string,
  offsetMs: number,
  shade = '#141413',
  baseWidth = 3.2,
): InkStroke {
  return {
    id,
    pen: 'fountain',
    shade,
    baseWidth,
    audioRecordingId: recId,
    audioOffsetMs: offsetMs,
    points: points.map(([x, y, p], idx) => ({ x, y, p, t: idx * 28 })),
  };
}

export function createStarterData(): {
  notes: NoteBook[];
  todos: TodoTask[];
  events: ScheduleEvent[];
  mindmap: MindMapDoc;
} {
  const today = new Date().toISOString().slice(0, 10);
  const recId = 'rec-demo-1';
  const demoAudioUrl = createDemoMeetingWavDataUrl(12);

  // Handwritten strokes ("Hope", "Arthur", "Reason") synced to timestamps
  const starterStrokes: InkStroke[] = [
    // "Hope" vertical stem + arch near (170, 320) -> synced at 00:01:23 (83000ms)
    makeWordStroke(
      'demo-stroke-hope-1',
      [
        [152, 290, 0.55],
        [152, 336, 0.72],
        [154, 315, 0.5],
        [182, 314, 0.65],
        [184, 292, 0.52],
        [185, 338, 0.7],
      ],
      recId,
      83000,
    ),
    makeWordStroke(
      'demo-stroke-hope-2',
      [
        [198, 322, 0.48],
        [214, 318, 0.62],
        [216, 335, 0.6],
        [198, 334, 0.48],
        [232, 322, 0.55],
        [258, 332, 0.42],
      ],
      recId,
      83000,
    ),
    // "Arthur" near (170, 410) -> synced at 00:02:15 (135000ms)
    makeWordStroke(
      'demo-stroke-arthur-1',
      [
        [155, 425, 0.55],
        [170, 382, 0.72],
        [186, 425, 0.6],
        [162, 408, 0.45],
        [208, 412, 0.58],
        [242, 408, 0.52],
        [278, 414, 0.44],
      ],
      recId,
      135000,
    ),
    // "Reason" near (170, 500) -> synced at 00:03:30 (210000ms)
    makeWordStroke(
      'demo-stroke-reason-1',
      [
        [156, 514, 0.6],
        [156, 474, 0.74],
        [182, 480, 0.62],
        [162, 494, 0.5],
        [188, 514, 0.68],
        [218, 506, 0.52],
        [258, 510, 0.46],
      ],
      recId,
      210000,
    ),
  ];

  const mainNote: NoteBook = {
    id: 'note-welcome-ainote',
    title: '주간 제품 전략 회의록',
    category: 'meeting',
    folder: 'Meetings',
    currentPage: 0,
    updatedAt: Date.now(),
    aiSummary:
      '• 핵심 결론: Click-to-Speak 필기-음성 점프 및 화자 구분·AI Meeting Minutes 자동 생성 통합\n• 실행 과제: [오늘] 화자 이름 일괄 변경 테스트 / [내일 15:00] 오디오 분리 내보내기 최종 점검',
    recordings: [
      {
        id: recId,
        title: '전략 회의 녹음 01',
        createdAt: Date.now() - 3600_000,
        durationMs: 245000,
        mimeType: 'audio/wav',
        dataUrl: demoAudioUrl,
        language: 'ko-KR',
        targetLanguage: 'en',
        tags: [
          { id: 'tag-1', offsetMs: 83000, label: '핵심 전략 (Hope)', pageIndex: 0 },
          { id: 'tag-2', offsetMs: 135000, label: '아키텍처 (Arthur)', pageIndex: 0 },
          { id: 'tag-3', offsetMs: 210000, label: '출시 일정 (Reason)', pageIndex: 0 },
        ],
        segments: [
          {
            id: 'seg-1',
            offsetMs: 4000,
            speaker: 'Speaker 1',
            text: '이번 분기 전자노트 핵심은 필기하는 순간 바로 음성이 함께 기록되고 나중에 필기만 눌러도 해당 대화가 재생되는 경험입니다.',
            translated:
              'This quarter, our core focus is simultaneous audio-ink recording where tapping handwriting replays the exact spoken moment.',
          },
          {
            id: 'seg-2',
            offsetMs: 83000,
            speaker: 'Speaker 2',
            text: '손글씨 옆 타임마크 00:01:23 나 동기화 밑줄을 탭하면 Click-to-Speak 로 즉시 해당 발언 구간부터 재생되도록 구현했습니다.',
            translated:
              'Tapping timestamp mark 00:01:23 or underlined handwriting triggers Click-to-Speak playback right from that moment.',
          },
          {
            id: 'seg-3',
            offsetMs: 135000,
            speaker: 'Speaker 1',
            text: '화자 이름을 Speaker 1 에서 실제 참석자로 바꿀 때 현재 구간만 수정할지 문서 전체에 적용할지 선택할 수 있게 했습니다.',
            translated:
              'When renaming Speaker 1 to a participant name, users can choose Only modify here or apply to the whole article.',
          },
          {
            id: 'seg-4',
            offsetMs: 210000,
            speaker: 'Speaker 2',
            text: '내일 오후 3시까지 Meeting Minutes 요약과 MP3/WAV 오디오 분리 내보내기 최종 확인 부탁드립니다.',
            translated:
              'Please verify Meeting Minutes generation and separate MP3/WAV audio file export by 3 PM tomorrow.',
          },
        ],
      },
    ],
    pages: [
      {
        id: 'page-welcome-1',
        index: 0,
        template: 'meeting',
        textLayer:
          '[안건] E-Ink AINOTE 2 차세대 회의 노트 점검\n- 실시간 동시 녹음 및 16개 언어 전사 / 양방향 번역 모드\n- 화자 구분(Speaker 1/2) 및 클릭-투-스피크 타임마크 동기화\n- 내일 오후 3시 배포 최종 확인 및 오디오 파일 내보내기',
        strokes: starterStrokes,
        timeMarks: [
          { id: 'tm-1', recordingId: recId, offsetMs: 83000, x: 96, y: 318, label: '00:01:23' },
          { id: 'tm-2', recordingId: recId, offsetMs: 210000, x: 96, y: 498, label: '00:03:30' },
        ],
      },
    ],
  };

  const quickStudyNote: NoteBook = {
    id: 'note-study-sprint',
    title: '개인 목표 · 독서 노트',
    category: 'study',
    folder: 'Personal Goals',
    currentPage: 0,
    updatedAt: Date.now() - 86400_000,
    recordings: [],
    pages: [
      {
        id: 'page-study-1',
        index: 0,
        template: 'cornell',
        textLayer:
          '# 코넬 독서 정리\n- 핵심 요지: 집중 시간을 방해 없는 종이 질감 워크스페이스로 전환\n- 올가미 AI로 수식/도표를 감싸 즉시 마크다운으로 변환',
        strokes: [],
        timeMarks: [],
      },
    ],
  };

  return {
    notes: [mainNote, quickStudyNote],
    todos: [
      {
        id: 'todo-1',
        title: 'Click-to-Speak 타임마크(00:01:23) 탭하여 오디오 점프 확인',
        done: false,
        dueDate: today,
        sourceNoteId: 'note-welcome-ainote',
        createdAt: Date.now(),
      },
      {
        id: 'todo-2',
        title: 'AI Aide → Meeting Minutes 요약 생성 후 노트에 삽입',
        done: false,
        dueDate: today,
        sourceNoteId: 'note-welcome-ainote',
        createdAt: Date.now() - 1000,
      },
    ],
    events: [
      {
        id: 'ev-1',
        title: '먹빛 AINOTE 2 차세대 배포 점검 회의',
        date: today,
        time: '15:00',
        notes: '녹음 전사 및 Recording Files 오디오 내보내기 확인',
      },
    ],
    mindmap: {
      id: 'mm-starter',
      title: 'AINOTE 2 생산성 워크플로',
      updatedAt: Date.now(),
      nodes: [
        { id: 'n-root', label: '먹빛 AI 전자노트', parentId: null, x: 420, y: 220 },
        { id: 'n-1', label: '만년필 · Click-to-Speak', parentId: 'n-root', x: 160, y: 120 },
        { id: 'n-2', label: '16개어 전사 · 화자 구분', parentId: 'n-root', x: 680, y: 120 },
        { id: 'n-3', label: 'AI Aide · Meeting Minutes', parentId: 'n-root', x: 160, y: 330 },
        { id: 'n-4', label: 'Files > Audio · 캘린더', parentId: 'n-root', x: 680, y: 330 },
      ],
    },
  };
}
