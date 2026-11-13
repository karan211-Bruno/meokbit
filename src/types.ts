export type PenKind = 'fountain' | 'ballpoint' | 'pencil' | 'brush' | 'highlighter';

export type PaperTemplateId =
  | 'blank'
  | 'lined'
  | 'meeting'
  | 'cornell'
  | 'grid'
  | 'dot'
  | 'manuscript200'
  | 'weekly'
  | 'todo'
  | 'interview'
  | 'music'
  | 'mindmap';

export interface InkPoint {
  x: number; // normalized 0..1000
  y: number; // normalized 0..1400
  p: number; // pressure 0..1
  t: number; // timestamp ms
}

export interface InkStroke {
  id: string;
  pen: PenKind;
  shade: string; // E-Ink ink grayscale hex
  baseWidth: number;
  points: InkPoint[];
  audioRecordingId?: string;
  audioOffsetMs?: number;
}

export interface TranscriptSegment {
  id: string;
  offsetMs: number;
  speaker: string;
  text: string;
  translated?: string;
}

export interface AudioMemo {
  id: string;
  title: string;
  createdAt: number;
  durationMs: number;
  mimeType: string;
  dataUrl: string;
  language: string;
  targetLanguage: string;
  segments: TranscriptSegment[];
  tags?: RecordingTag[];
}

export interface NotePage {
  id: string;
  index: number;
  template: PaperTemplateId;
  backgroundImage?: string; // for imported PDF/document pages
  textLayer: string;
  strokes: InkStroke[];
  timeMarks?: PageTimeMark[];
}

export interface NoteBook {
  id: string;
  title: string;
  category: 'meeting' | 'study' | 'document' | 'quick';
  folder?: NoteFolder;
  pages: NotePage[];
  currentPage: number;
  recordings: AudioMemo[];
  aiSummary?: string;
  updatedAt: number;
}

export interface TodoTask {
  id: string;
  title: string;
  done: boolean;
  dueDate?: string;
  sourceNoteId?: string;
  createdAt: number;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  notes?: string;
}

export interface MindNode {
  id: string;
  label: string;
  parentId: string | null;
  x: number;
  y: number;
}

export interface MindMapDoc {
  id: string;
  title: string;
  nodes: MindNode[];
  updatedAt: number;
}

export type NoteFolder = 'All' | 'Default' | 'Meetings' | 'Personal Goals' | 'Projects';

export interface RecordingTag {
  id: string;
  offsetMs: number;
  label: string;
  pageIndex: number;
}

export interface PageTimeMark {
  id: string;
  recordingId: string;
  offsetMs: number;
  x: number;
  y: number;
  label: string;
}

export interface TranslationPair {
  id: string;
  sourceCode: string;
  sourceLabel: string;
  targetCode: string;
  targetLabel: string;
}

export interface ExportedAudioFile {
  id: string;
  name: string;
  format: 'wav' | 'mp3' | 'webm';
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  dataUrl: string;
  createdAt: number;
  sourceNoteTitle: string;
}

export type TranslationDisplayMode = 'original' | 'translation' | 'both';

export interface AiSettings {
  provider: 'local' | 'openai' | 'gemini' | 'custom';
  apiKey: string;
  model: string;
  baseUrl: string;
  readingLight: number; // 0..100 (warm reading lamp overlay)
  speechLang: string;
  translateLang: string;
  translationMode: TranslationDisplayMode;
  savedTranslationPairs: TranslationPair[];
  showSyncMarkers: boolean;
  clickToSpeak: boolean;
  splitPaneHeight: number;
}
