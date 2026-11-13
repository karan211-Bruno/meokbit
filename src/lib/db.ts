import { openDB, type IDBPDatabase } from 'idb';
import type {
  AiSettings,
  MindMapDoc,
  NoteBook,
  ScheduleEvent,
  TodoTask,
} from '../types';

const DB_NAME = 'meokbit-db';
const DB_VERSION = 1;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'local',
  apiKey: '',
  model: 'gpt-5',
  baseUrl: 'https://api.openai.com/v1',
  readingLight: 0,
  speechLang: 'ko-KR',
  translateLang: 'en',
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
      },
    });
  }
  return dbPromise;
}

export async function loadAiSettings(): Promise<AiSettings> {
  try {
    const db = await getDb();
    const rec = await db.get('prefs', 'aiSettings');
    if (rec?.value) return { ...DEFAULT_AI_SETTINGS, ...rec.value };
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

export async function exportMeokbitBackup(): Promise<string> {
  const [notes, todos, events, mindmaps, settings] = await Promise.all([
    listNotes(),
    listTodos(),
    listEvents(),
    listMindMaps(),
    loadAiSettings(),
  ]);
  return JSON.stringify(
    {
      app: 'meokbit',
      version: '1.0.0',
      settings: { ...settings, apiKey: '' }, // omit secret key from portable backup
      notes,
      todos,
      events,
      mindmaps,
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
  };
  let total = 0;
  for (const n of data.notes || []) {
    await saveNote(n);
    total++;
  }
  for (const t of data.todos || []) await saveTodo(t);
  for (const e of data.events || []) await saveEvent(e);
  for (const m of data.mindmaps || []) await saveMindMap(m);
  return total;
}

export function createStarterData(): {
  note: NoteBook;
  todos: TodoTask[];
  events: ScheduleEvent[];
  mindmap: MindMapDoc;
} {
  const today = new Date().toISOString().slice(0, 10);
  const recId = 'rec-demo-1';
  return {
    note: {
      id: 'note-welcome-ainote',
      title: '주간 제품 전략 회의록 (샘플)',
      category: 'meeting',
      currentPage: 0,
      updatedAt: Date.now(),
      aiSummary:
        '• 핵심 결론: 300PPI E-Ink 필기 지연 최소화 및 회의 녹음-필기 동기화 UX 집중\n• 실행 과제: [오늘] 만년필 캘리그래피 감도 점검 / [금요일] 올가미 AI 요약 데모 검증',
      recordings: [
        {
          id: recId,
          title: '전략 회의 녹음 01',
          createdAt: Date.now() - 3600_000,
          durationMs: 185000,
          mimeType: 'audio/webm',
          dataUrl: '',
          language: 'ko-KR',
          targetLanguage: 'en',
          segments: [
            {
              id: 'seg-1',
              offsetMs: 4000,
              speaker: '화자 1 (기획)',
              text: '이번 분기 전자노트 핵심은 필기하는 순간 바로 음성이 함께 기록되고 나중에 필기만 눌러도 해당 대화가 재생되는 경험입니다.',
              translated:
                'This quarter, our core focus is simultaneous audio-ink recording where tapping handwriting replays the exact spoken moment.',
            },
            {
              id: 'seg-2',
              offsetMs: 42000,
              speaker: '화자 2 (개발)',
              text: '올가미로 손글씨를 감싸면 AI 에이드가 마크다운으로 변환하거나 바로 할 일 목록에 추가하도록 연동했습니다.',
              translated:
                'When users lasso handwriting, AI Aid converts it to Markdown or adds it directly to their To-Do list.',
            },
            {
              id: 'seg-3',
              offsetMs: 98000,
              speaker: '화자 1 (기획)',
              text: '내일 오후 3시까지 구글 캘린더와 .ics 일정 내보내기 최종 확인 부탁드립니다.',
              translated:
                'Please verify Google Calendar and .ics schedule export by 3 PM tomorrow.',
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
            '[안건] E-Ink 전자노트 1차 런칭 점검\n- 만년필 브러시 필압 곡선 최종 튜닝\n- 회의 녹음 + 손글씨 동기화 재생 확인\n- 올가미 선택 후 AI 질문 / 업무 추가 시연\n- 내일 오후 3시 배포 최종 회의',
          strokes: [
            {
              id: 'demo-stroke-1',
              pen: 'fountain',
              shade: '#151513',
              baseWidth: 4.5,
              audioRecordingId: recId,
              audioOffsetMs: 4000,
              points: [
                { x: 140, y: 260, p: 0.4, t: 0 },
                { x: 240, y: 255, p: 0.7, t: 40 },
                { x: 350, y: 262, p: 0.6, t: 80 },
                { x: 420, y: 258, p: 0.35, t: 120 },
              ],
            },
          ],
        },
      ],
    },
    todos: [
      {
        id: 'todo-1',
        title: '만년필 브러시로 회의 필기 & 올가미 AI 검색 테스트',
        done: false,
        dueDate: today,
        sourceNoteId: 'note-welcome-ainote',
        createdAt: Date.now(),
      },
      {
        id: 'todo-2',
        title: 'AI 에이드 → 회의 적요 요약 실행해 보기',
        done: false,
        dueDate: today,
        sourceNoteId: 'note-welcome-ainote',
        createdAt: Date.now() - 1000,
      },
    ],
    events: [
      {
        id: 'ev-1',
        title: '먹빛 E-Ink 노트 1차 배포 점검 회의',
        date: today,
        time: '15:00',
        notes: '녹음 전사 및 Google 캘린더 내보내기 확인',
      },
    ],
    mindmap: {
      id: 'mm-starter',
      title: '생산성 노트 핵심 구조',
      updatedAt: Date.now(),
      nodes: [
        { id: 'n-root', label: '먹빛 AI 전자노트', parentId: null, x: 420, y: 220 },
        { id: 'n-1', label: '만년필 · 올가미 필기', parentId: 'n-root', x: 160, y: 120 },
        { id: 'n-2', label: '동시 녹음 · 16개어 전사', parentId: 'n-root', x: 680, y: 120 },
        { id: 'n-3', label: 'AI 회의 적요 · 문서 작성', parentId: 'n-root', x: 160, y: 330 },
        { id: 'n-4', label: '캘린더(.ics) · 할 일', parentId: 'n-root', x: 680, y: 330 },
      ],
    },
  };
}
