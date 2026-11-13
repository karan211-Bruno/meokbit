import React, { useEffect, useRef, useState } from 'react';
import {
  AiSettings,
  ExportedAudioFile,
  InkStroke,
  MindMapDoc,
  NoteBook,
  NoteFolder,
  PaperTemplateId,
  PenKind,
  ScheduleEvent,
  TodoTask,
  TranscriptSegment,
} from './types';
import {
  createStarterData,
  DEFAULT_AI_SETTINGS,
  deleteAudioFile,
  deleteEvent,
  deleteNote,
  deleteTodo,
  exportMeokbitBackup,
  importMeokbitBackup,
  listAudioFiles,
  listEvents,
  listMindMaps,
  listNotes,
  listTodos,
  loadAiSettings,
  saveAiSettings,
  saveAudioFile,
  saveEvent,
  saveMindMap,
  saveNote,
  saveTodo,
} from './lib/db';
import { PAPER_TEMPLATES } from './lib/templates';
import { startSyncedVoiceSession } from './lib/voiceRecorder';
import {
  quickTranslateLine,
  runFullMeetingMinutes,
  type StructuredMeetingMinutes,
} from './lib/aiAssistant';
import { createDemoMeetingWavDataUrl } from './lib/audioExport';
import { formatDurationMs } from './lib/formatTime';
import { importDocumentAsNote } from './lib/docLoader';
import { exportDataUrlArtifact, exportTextArtifact } from './lib/native';
import { EInkStage } from './components/EInkStage';
import { InkCanvas, LassoSelection } from './components/InkCanvas';
import { AiAidSheet } from './components/AiAidSheet';
import { MindMapEditor } from './components/MindMapEditor';
import { CalendarTodoPanel } from './components/CalendarTodoPanel';
import { HomeLauncher } from './components/HomeLauncher';
import { TranscriptionPopup } from './components/TranscriptionPopup';
import { LanguageModeModal } from './components/LanguageModeModal';
import { MeetingMinutesView } from './components/MeetingMinutesView';
import { ShareExportModal } from './components/ShareExportModal';
import { RetranscribeModal } from './components/RetranscribeModal';

type AppView = 'launcher' | 'editor' | 'schedule' | 'mindmap' | 'settings';

export function App() {
  const [view, setView] = useState<AppView>('launcher');
  const [launcherSection, setLauncherSection] = useState<'notes' | 'files-audio'>('notes');
  const [notes, setNotes] = useState<NoteBook[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [todos, setTodos] = useState<TodoTask[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [mindMaps, setMindMaps] = useState<MindMapDoc[]>([]);
  const [audioFiles, setAudioFiles] = useState<ExportedAudioFile[]>([]);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  // Canvas & Pen tools
  const [toolMode, setToolMode] = useState<'pen' | 'eraser' | 'lasso' | 'text'>('pen');
  const [penKind, setPenKind] = useState<PenKind>('fountain');
  const [penShade, setPenShade] = useState<string>('#121212');
  const [penWidth, setPenWidth] = useState<number>(2.6);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);

  // Editor popovers & AINOTE 2 modals
  const [penMenuOpen, setPenMenuOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [retransModalOpen, setRetransModalOpen] = useState(false);

  // Split transcription popup state
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [speakerIdEnabled, setSpeakerIdEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [activeRecordingId, setActiveRecordingId] = useState<string | undefined>(undefined);
  const [liveSegments, setLiveSegments] = useState<TranscriptSegment[]>([]);
  const [playbackTimeMs, setPlaybackTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [playbackHighlightMs, setPlaybackHighlightMs] = useState<number | null>(null);

  const voiceSessionRef = useRef<{
    stop: () => Promise<{ dataUrl: string; mimeType: string; durationMs: number }>;
    getElapsedMs: () => number;
  } | null>(null);
  const liveSegmentsRef = useRef<TranscriptSegment[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // AI Meeting Minutes & Lasso AI Sheet
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [minutesGenerating, setMinutesGenerating] = useState(false);
  const [minutesData, setMinutesData] = useState<StructuredMeetingMinutes | null>(null);
  const [quickMemoText, setQuickMemoText] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);
  const [aiInitialImage, setAiInitialImage] = useState<string | undefined>(undefined);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Load persisted data
  useEffect(() => {
    (async () => {
      const s = await loadAiSettings();
      setSettings(s);
      let loadedNotes = await listNotes();
      let loadedTodos = await listTodos();
      let loadedEvents = await listEvents();
      let loadedMaps = await listMindMaps();
      const loadedAudio = await listAudioFiles();

      if (loadedNotes.length === 0) {
        const starter = createStarterData();
        for (const n of starter.notes) await saveNote(n);
        for (const t of starter.todos) await saveTodo(t);
        for (const ev of starter.events) await saveEvent(ev);
        await saveMindMap(starter.mindmap);
        loadedNotes = starter.notes;
        loadedTodos = starter.todos;
        loadedEvents = starter.events;
        loadedMaps = [starter.mindmap];
      }

      setNotes(loadedNotes);
      setActiveNoteId(loadedNotes[0]?.id || '');
      setTodos(loadedTodos);
      setEvents(loadedEvents);
      setMindMaps(loadedMaps);
      setAudioFiles(loadedAudio);
    })();
  }, []);

  // Recording elapsed ticker
  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => {
      setRecordingMs(voiceSessionRef.current?.getElapsedMs() ?? 0);
    }, 300);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const activeNote = notes.find((n) => n.id === activeNoteId) || notes[0] || null;
  const activePage = activeNote ? activeNote.pages[activeNote.currentPage] || activeNote.pages[0] : null;
  const primaryRecording = activeNote?.recordings[0] || null;

  const notify = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => setStatusMessage(''), 3400);
  };

  const persistNote = async (next: NoteBook) => {
    const updated = { ...next, updatedAt: Date.now() };
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === updated.id);
      const list = exists ? prev.map((n) => (n.id === updated.id ? updated : n)) : [updated, ...prev];
      return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    await saveNote(updated);
  };

  const handleUpdateSettings = (next: AiSettings) => {
    setSettings(next);
    void saveAiSettings(next);
  };

  const handleCreateNote = async (
    template: PaperTemplateId = 'meeting',
    folder: NoteFolder = 'Meetings',
  ) => {
    const note: NoteBook = {
      id: `note_${Date.now()}`,
      title: `새 노트 ${notes.length + 1}`,
      category: folder === 'Meetings' ? 'meeting' : 'study',
      folder,
      currentPage: 0,
      pages: [
        {
          id: `pg_${Date.now()}`,
          index: 0,
          template,
          textLayer: '',
          strokes: [],
          timeMarks: [],
        },
      ],
      recordings: [],
      updatedAt: Date.now(),
    };
    await persistNote(note);
    setActiveNoteId(note.id);
    setView('editor');
    notify(`새 E-Ink 노트(${folder})를 생성했습니다.`);
  };

  const handleDeleteNote = async (id: string) => {
    if (notes.length <= 1) {
      notify('마지막 노트는 삭제할 수 없습니다.');
      return;
    }
    await deleteNote(id);
    const remaining = notes.filter((n) => n.id !== id);
    setNotes(remaining);
    if (activeNoteId === id && remaining[0]) {
      setActiveNoteId(remaining[0].id);
    }
  };

  const handleUpdatePageStrokes = (strokes: InkStroke[]) => {
    if (!activeNote || !activePage) return;
    const pages = activeNote.pages.map((p, idx) =>
      idx === activeNote.currentPage ? { ...p, strokes } : p,
    );
    void persistNote({ ...activeNote, pages });
  };

  const handleUpdatePageText = (textLayer: string) => {
    if (!activeNote || !activePage) return;
    const pages = activeNote.pages.map((p, idx) =>
      idx === activeNote.currentPage ? { ...p, textLayer } : p,
    );
    void persistNote({ ...activeNote, pages });
  };

  const handleChangeTemplate = (template: PaperTemplateId) => {
    if (!activeNote || !activePage) return;
    const pages = activeNote.pages.map((p, idx) =>
      idx === activeNote.currentPage ? { ...p, template } : p,
    );
    void persistNote({ ...activeNote, pages });
  };

  const handleAddPage = () => {
    if (!activeNote || !activePage) return;
    const nextPages = [
      ...activeNote.pages,
      {
        id: `pg_${Date.now()}`,
        index: activeNote.pages.length,
        template: activePage.template,
        textLayer: '',
        strokes: [],
        timeMarks: [],
      },
    ];
    void persistNote({
      ...activeNote,
      pages: nextPages,
      currentPage: nextPages.length - 1,
    });
  };

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  };

  const playAudioAtOffset = (dataUrl: string, offsetMs: number, displayDurationMs: number) => {
    setPlaybackTimeMs(offsetMs);
    setPlaybackHighlightMs(offsetMs);
    const src = dataUrl || createDemoMeetingWavDataUrl(12);
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.ontimeupdate = () => {
        if (!audioRef.current) return;
        const rawSec = audioRef.current.currentTime;
        const mappedMs = Math.round(rawSec * 1000);
        setPlaybackTimeMs((prev) => (displayDurationMs > 25000 ? prev : mappedMs));
      };
    }
    const audio = audioRef.current;
    if (audio.src !== src) {
      audio.src = src;
    }
    audio.playbackRate = playbackRate;
    const seekSec = Math.max(0, offsetMs / 1000);
    const tryPlay = () => {
      const maxSec = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 12;
      audio.currentTime = seekSec % Math.max(1, maxSec - 0.3);
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    };
    if (audio.readyState >= 1) {
      tryPlay();
    } else {
      audio.onloadedmetadata = tryPlay;
    }
  };

  const handleSeekAudio = (recordingId: string, offsetMs: number) => {
    const rec =
      activeNote?.recordings.find((r) => r.id === recordingId) || primaryRecording;
    if (!rec) return;
    if (!transcriptOpen) setTranscriptOpen(true);
    playAudioAtOffset(rec.dataUrl, offsetMs, rec.durationMs);
    notify(`${formatDurationMs(offsetMs)} 시점부터 음성을 재생합니다.`);
  };

  const handleTogglePlayPause = () => {
    if (!primaryRecording) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    playAudioAtOffset(primaryRecording.dataUrl, playbackTimeMs, primaryRecording.durationMs);
  };

  const handleStartVoice = async () => {
    if (!activeNote) return;
    if (isRecording) {
      const done = await voiceSessionRef.current?.stop();
      setIsRecording(false);
      setActiveRecordingId(undefined);
      if (done) {
        const capturedSegments =
          liveSegmentsRef.current.length > 0
            ? [...liveSegmentsRef.current]
            : [
                {
                  id: `seg_${Date.now()}`,
                  offsetMs: 0,
                  speaker: 'Speaker 1',
                  text: '(음성 녹음 완료 — 필기와 시간축이 동기화되었습니다)',
                  translated: quickTranslateLine(
                    '음성 녹음 완료 — 필기와 시간축이 동기화되었습니다',
                    settings.translateLang,
                  ),
                },
              ];
        const memo = {
          id: activeRecordingId || `rec_${Date.now()}`,
          title: `녹음 ${activeNote.recordings.length + 1}`,
          createdAt: Date.now(),
          durationMs: Math.max(done.durationMs, 1000),
          mimeType: done.mimeType || 'audio/wav',
          dataUrl: done.dataUrl || createDemoMeetingWavDataUrl(8),
          language: settings.speechLang,
          targetLanguage: settings.translateLang,
          tags: [],
          segments: capturedSegments,
        };
        liveSegmentsRef.current = [];
        setLiveSegments([]);
        await persistNote({
          ...activeNote,
          recordings: [memo, ...activeNote.recordings],
        });
        notify(`음성 녹음 및 전사(${capturedSegments.length}구간)가 노트에 저장되었습니다.`);
      }
      return;
    }

    stopAudioPlayback();
    const recId = `rec_${Date.now()}`;
    liveSegmentsRef.current = [];
    setLiveSegments([]);
    setActiveRecordingId(recId);
    setRecordingMs(0);
    setIsRecording(true);
    setTranscriptOpen(true);

    try {
      const session = await startSyncedVoiceSession(
        settings.speechLang,
        (text, isFinal, offsetMs) => {
          if (!isFinal) return;
          const speakerIdx = liveSegmentsRef.current.length % 2 === 0 ? 'Speaker 1' : 'Speaker 2';
          const seg: TranscriptSegment = {
            id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            offsetMs,
            speaker: speakerIdx,
            text,
            translated: quickTranslateLine(text, settings.translateLang),
          };
          liveSegmentsRef.current = [...liveSegmentsRef.current, seg];
          setLiveSegments(liveSegmentsRef.current);
        },
        (err) => notify(err),
      );
      voiceSessionRef.current = session;
      notify('필기-음성 실시간 동기화 녹음을 시작했습니다.');
    } catch {
      setIsRecording(false);
      setActiveRecordingId(undefined);
      notify('마이크 권한을 확인할 수 없어 음성 녹음을 시작하지 못했습니다.');
    }
  };

  const handleAddRecordingTag = () => {
    if (!activeNote || !activePage) return;
    const targetOffset = isRecording ? recordingMs : playbackTimeMs;
    const label = formatDurationMs(targetOffset);
    const recId = isRecording ? activeRecordingId || 'rec-live' : primaryRecording?.id || 'rec-demo-1';

    const newMark = {
      id: `tm_${Date.now()}`,
      recordingId: recId,
      offsetMs: targetOffset,
      x: 96,
      y: Math.min(1260, 260 + (activePage.timeMarks?.length || 0) * 86),
      label,
    };

    const nextPages = activeNote.pages.map((p, idx) =>
      idx === activeNote.currentPage
        ? { ...p, timeMarks: [...(p.timeMarks || []), newMark] }
        : p,
    );

    const nextRecordings = primaryRecording
      ? activeNote.recordings.map((r, i) =>
          i === 0
            ? {
                ...r,
                tags: [
                  ...(r.tags || []),
                  {
                    id: `tag_${Date.now()}`,
                    offsetMs: targetOffset,
                    label: `북마크 ${label}`,
                    pageIndex: activeNote.currentPage,
                  },
                ],
              }
            : r,
        )
      : activeNote.recordings;

    void persistNote({ ...activeNote, pages: nextPages, recordings: nextRecordings });
    notify(`타임마크 태그(${label})를 노트에 기록했습니다.`);
  };

  const handleRenameSpeaker = (
    segmentId: string,
    oldSpeaker: string,
    newSpeaker: string,
    scope: 'here' | 'all',
  ) => {
    if (!activeNote || !primaryRecording) return;
    const nextSegments = primaryRecording.segments.map((seg) => {
      if (scope === 'here') {
        return seg.id === segmentId ? { ...seg, speaker: newSpeaker } : seg;
      }
      return seg.speaker === oldSpeaker ? { ...seg, speaker: newSpeaker } : seg;
    });
    const nextRecordings = activeNote.recordings.map((r) =>
      r.id === primaryRecording.id ? { ...r, segments: nextSegments } : r,
    );
    void persistNote({ ...activeNote, recordings: nextRecordings });
    notify(
      scope === 'all'
        ? `"${oldSpeaker}" → "${newSpeaker}" (문서 전체 적용 완료)`
        : `선택 구간 화자를 "${newSpeaker}"(으)로 변경했습니다.`,
    );
  };

  const handleOpenMeetingMinutes = async () => {
    if (!activeNote || !activePage) return;
    setMinutesOpen(true);
    setMinutesGenerating(true);
    const segments = primaryRecording?.segments || [];
    try {
      await new Promise((r) => window.setTimeout(r, 260));
      const res = await runFullMeetingMinutes(
        settings,
        activeNote.title,
        activePage.textLayer,
        segments,
      );
      setMinutesData(res);
    } finally {
      setMinutesGenerating(false);
    }
  };

  const handleRunRetranscribe = (opts: {
    recordingId: string;
    scope: 'complete' | 'rewind';
    multiplayerMode: boolean;
    speechLang: string;
    translateLang: string;
  }) => {
    if (!activeNote) return;
    const nextRecordings = activeNote.recordings.map((rec) => {
      if (rec.id !== opts.recordingId) return rec;
      const updatedSegs = rec.segments.map((seg, idx) => ({
        ...seg,
        speaker: opts.multiplayerMode ? seg.speaker || `Speaker ${(idx % 2) + 1}` : 'Speaker 1',
        translated: quickTranslateLine(seg.text, opts.translateLang),
      }));
      return {
        ...rec,
        language: opts.speechLang,
        targetLanguage: opts.translateLang,
        segments: updatedSegs,
      };
    });
    handleUpdateSettings({
      ...settings,
      speechLang: opts.speechLang,
      translateLang: opts.translateLang,
    });
    void persistNote({ ...activeNote, recordings: nextRecordings });
    notify('Voice to text conversion successful');
  };

  const handleImportDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      notify(`"${file.name}" 불러오는 중...`);
      const imported = await importDocumentAsNote(file);
      imported.folder = 'Default';
      await persistNote(imported);
      setActiveNoteId(imported.id);
      setView('editor');
      notify(`"${file.name}" (${imported.pages.length}페이지) 가져오기 완료`);
    } catch (err) {
      notify(`문서 불러오기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleLassoAction = (
    action: 'ai-ask' | 'to-markdown' | 'to-todo' | 'delete',
    selection: LassoSelection,
  ) => {
    if (!activeNote || !activePage) return;
    if (action === 'delete') {
      const nextStrokes = activePage.strokes.filter((s) => !selection.strokeIds.includes(s.id));
      handleUpdatePageStrokes(nextStrokes);
      notify('선택한 필기를 삭제했습니다.');
      return;
    }
    if (action === 'to-todo') {
      const todo: TodoTask = {
        id: `td_${Date.now()}`,
        title: `올가미 손글씨 할 일 (${activeNote.title})`,
        done: false,
        sourceNoteId: activeNote.id,
        createdAt: Date.now(),
      };
      void saveTodo(todo).then(() => setTodos((prev) => [todo, ...prev]));
      notify('선택 영역을 할 일(To-Do)에 추가했습니다.');
      return;
    }
    setAiInitialImage(selection.cropDataUrl);
    setAiInitialPrompt(
      action === 'to-markdown'
        ? '선택한 손글씨 영역을 깔끔한 한국어 마크다운 목록과 제목으로 정리해 줘.'
        : '선택한 손글씨 영역의 핵심 개념과 보충 설명을 정리해 줘.',
    );
    setAiModalOpen(true);
  };

  const handleCyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="meokbit-v2-shell">
      <EInkStage
        readingLight={settings.readingLight}
        quickMemoText={quickMemoText}
        onQuickMemoChange={setQuickMemoText}
        onSaveQuickMemoAsTodo={() => {
          if (!quickMemoText.trim()) return;
          const todo: TodoTask = {
            id: `td_${Date.now()}`,
            title: quickMemoText.trim(),
            done: false,
            sourceNoteId: activeNote?.id,
            createdAt: Date.now(),
          };
          void saveTodo(todo).then(() => setTodos((p) => [todo, ...p]));
          setQuickMemoText('');
          notify('퀵 메모를 할 일(To-Do)로 저장했습니다.');
        }}
        onQuickAiSubmit={(q) => {
          setAiInitialImage(undefined);
          setAiInitialPrompt(q);
          setAiModalOpen(true);
        }}
        onFullRefresh={() => {
          setRefreshNonce((n) => n + 1);
          notify('E-Ink 전체 화면 잔상을 제거했습니다.');
        }}
      >
        {statusMessage && (
          <div className="eink-toast" role="status" data-testid="eink-toast">
            {statusMessage}
          </div>
        )}

        {view === 'launcher' && (
          <HomeLauncher
            notes={notes}
            audioFiles={audioFiles}
            todosCount={todos.filter((t) => !t.done).length}
            eventsCount={events.length}
            mindMapsCount={mindMaps.length}
            initialSection={launcherSection}
            onOpenNote={(id) => {
              setActiveNoteId(id);
              setLauncherSection('notes');
              setView('editor');
            }}
            onCreateNote={handleCreateNote}
            onDeleteNote={handleDeleteNote}
            onImportDoc={handleImportDoc}
            onOpenTab={(tabName) => setView(tabName)}
            onPlayAudioFile={(file) => {
              playAudioAtOffset(file.dataUrl, 0, file.durationMs);
              notify(`${file.name} 재생을 시작합니다.`);
            }}
            onShareAudioFile={(file) => {
              void exportDataUrlArtifact(file.name, file.dataUrl);
            }}
            onDeleteAudioFile={(id) => {
              void deleteAudioFile(id).then(() =>
                setAudioFiles((prev) => prev.filter((f) => f.id !== id)),
              );
            }}
          />
        )}

        {view === 'editor' && activeNote && activePage && (
          <div className="ainote-editor-shell" data-testid="ainote-editor">
            {/* Authentic Top E-Ink AINOTE 2 Icon Toolbar */}
            <header className="ainote-top-bar">
              <div className="top-bar-group">
                <button
                  type="button"
                  className="icon-tool-btn"
                  data-testid="back-to-launcher"
                  onClick={() => {
                    setLauncherSection('notes');
                    setView('launcher');
                  }}
                  title="홈 런처로 돌아가기"
                >
                  ←
                </button>
                <input
                  type="text"
                  className="editor-title-input"
                  value={activeNote.title}
                  onChange={(e) => void persistNote({ ...activeNote, title: e.target.value })}
                  aria-label="노트 제목"
                />
              </div>

              <div className="top-bar-group tool-icons-row">
                <button
                  type="button"
                  className="icon-tool-btn"
                  title="Undo (실행 취소)"
                  onClick={() => setUndoSignal((n) => n + 1)}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="icon-tool-btn"
                  title="Redo (다시 실행)"
                  onClick={() => setRedoSignal((n) => n + 1)}
                >
                  ↷
                </button>

                <div className="popover-anchor">
                  <button
                    type="button"
                    className={`icon-tool-btn ${toolMode === 'pen' ? 'is-active' : ''}`}
                    title="만년필 · 펜 스타일"
                    onClick={() => {
                      setToolMode('pen');
                      setPenMenuOpen((v) => !v);
                      setPageMenuOpen(false);
                      setMoreMenuOpen(false);
                    }}
                  >
                    ✒
                  </button>
                  {penMenuOpen && (
                    <div className="eink-popover">
                      <label>
                        펜 종류
                        <select
                          value={penKind}
                          onChange={(e) => setPenKind(e.target.value as PenKind)}
                        >
                          <option value="fountain">만년필 (필압+속도)</option>
                          <option value="ballpoint">볼펜</option>
                          <option value="pencil">연필</option>
                          <option value="brush">붓펜</option>
                          <option value="highlighter">형광펜</option>
                        </select>
                      </label>
                      <label>
                        먹 농도
                        <select value={penShade} onChange={(e) => setPenShade(e.target.value)}>
                          <option value="#121212">먹색 #121212</option>
                          <option value="#404040">진회색 #404040</option>
                          <option value="#757575">중회색 #757575</option>
                          <option value="#a8a8a8">연회색 #a8a8a8</option>
                        </select>
                      </label>
                      <label>
                        굵기 ({penWidth})
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={0.5}
                          value={penWidth}
                          onChange={(e) => setPenWidth(Number(e.target.value))}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={`icon-tool-btn ${toolMode === 'eraser' ? 'is-active' : ''}`}
                  title="지우개"
                  onClick={() => setToolMode('eraser')}
                >
                  ▱
                </button>
                <button
                  type="button"
                  className={`icon-tool-btn ${toolMode === 'text' ? 'is-active' : ''}`}
                  title="T 텍스트 직접 편집"
                  onClick={() => setToolMode('text')}
                >
                  T
                </button>
                <button
                  type="button"
                  className={`icon-tool-btn ${toolMode === 'lasso' ? 'is-active' : ''}`}
                  title="⬚ 올가미 AI 검색 · 변환"
                  onClick={() => setToolMode('lasso')}
                >
                  ⬚
                </button>
              </div>

              <div className="top-bar-group">
                {/* Persistent Mic Pill (toggles Transcription split-pane or stops recording) */}
                <button
                  type="button"
                  className={`mic-pill-btn ${isRecording ? 'is-recording' : ''}`}
                  data-testid="top-mic-pill"
                  onClick={() => {
                    if (isRecording && !transcriptOpen) {
                      setTranscriptOpen(true);
                    } else if (!transcriptOpen) {
                      setTranscriptOpen(true);
                    } else {
                      void handleStartVoice();
                    }
                  }}
                >
                  🎙{' '}
                  {isRecording
                    ? `REC ${formatDurationMs(recordingMs)}`
                    : transcriptOpen
                      ? '녹음 시작'
                      : '전사 창 열기'}
                </button>

                <button
                  type="button"
                  className="btn-ink-sm"
                  data-testid="ai-aide-minutes-btn"
                  onClick={handleOpenMeetingMinutes}
                >
                  ✦ AI Aide
                </button>

                <button
                  type="button"
                  className="icon-tool-btn"
                  data-testid="share-modal-btn"
                  title="Share (Web / PDF / Text / Recording Files)"
                  onClick={() => setShareModalOpen(true)}
                >
                  ⤴
                </button>

                <button
                  type="button"
                  className="icon-tool-btn"
                  data-testid="retranscribe-modal-btn"
                  title="Retranscribe (다시 전사)"
                  onClick={() => setRetransModalOpen(true)}
                >
                  ⟲
                </button>

                {/* Page & Template Popover */}
                <div className="popover-anchor">
                  <button
                    type="button"
                    className="icon-tool-btn"
                    title="속지 템플릿 및 페이지"
                    onClick={() => {
                      setPageMenuOpen((v) => !v);
                      setPenMenuOpen(false);
                      setMoreMenuOpen(false);
                    }}
                  >
                    📑 {activeNote.currentPage + 1}/{activeNote.pages.length}
                  </button>
                  {pageMenuOpen && (
                    <div className="eink-popover">
                      <label>
                        속지 템플릿
                        <select
                          value={activePage.template}
                          onChange={(e) => handleChangeTemplate(e.target.value as PaperTemplateId)}
                        >
                          {PAPER_TEMPLATES.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="popover-row-btns">
                        <button
                          type="button"
                          className="btn-outline-sm"
                          disabled={activeNote.currentPage <= 0}
                          onClick={() =>
                            void persistNote({
                              ...activeNote,
                              currentPage: activeNote.currentPage - 1,
                            })
                          }
                        >
                          이전 쪽
                        </button>
                        <button
                          type="button"
                          className="btn-outline-sm"
                          disabled={activeNote.currentPage >= activeNote.pages.length - 1}
                          onClick={() =>
                            void persistNote({
                              ...activeNote,
                              currentPage: activeNote.currentPage + 1,
                            })
                          }
                        >
                          다음 쪽
                        </button>
                        <button type="button" className="btn-ink-sm" onClick={handleAddPage}>
                          + 새 쪽
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* More Menu ("Show text-audio sync markers" + "Click-to-Speak") */}
                <div className="popover-anchor">
                  <button
                    type="button"
                    className="icon-tool-btn"
                    data-testid="more-menu-btn"
                    title="더보기 설정"
                    onClick={() => {
                      setMoreMenuOpen((v) => !v);
                      setPenMenuOpen(false);
                      setPageMenuOpen(false);
                    }}
                  >
                    ⋮
                  </button>
                  {moreMenuOpen && (
                    <div className="eink-popover more-popover" data-testid="more-popover">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={settings.showSyncMarkers}
                          onChange={(e) =>
                            handleUpdateSettings({
                              ...settings,
                              showSyncMarkers: e.target.checked,
                            })
                          }
                        />
                        <span>Show text-audio sync markers</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={settings.clickToSpeak}
                          onChange={(e) =>
                            handleUpdateSettings({
                              ...settings,
                              clickToSpeak: e.target.checked,
                            })
                          }
                        />
                        <span>Click-to-Speak (필기 탭 오디오 점프)</span>
                      </label>
                      <button
                        type="button"
                        className="btn-outline-sm full-width"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setAiInitialImage(undefined);
                          setAiInitialPrompt(undefined);
                          setAiModalOpen(true);
                        }}
                      >
                        ✦ AI 자유 질문 · 번역 도우미
                      </button>
                      <button
                        type="button"
                        className="btn-outline-sm full-width"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setView('settings');
                        }}
                      >
                        ⚙ 프론트라이트 · 백업 설정
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Top-Docked Resizable & Collapsible Transcription Split-Pane */}
            <TranscriptionPopup
              open={transcriptOpen}
              heightPx={settings.splitPaneHeight || 236}
              onChangeHeight={(h) => handleUpdateSettings({ ...settings, splitPaneHeight: h })}
              onHide={() => setTranscriptOpen(false)}
              isRecording={isRecording}
              recordingMs={recordingMs}
              activeMemo={primaryRecording}
              liveSegments={liveSegments}
              playbackTimeMs={playbackTimeMs}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              translationMode={settings.translationMode}
              speechLang={settings.speechLang}
              translateLang={settings.translateLang}
              speakerIdEnabled={speakerIdEnabled}
              onToggleSpeakerId={() => setSpeakerIdEnabled((v) => !v)}
              onAddTag={handleAddRecordingTag}
              onSeekOffset={(offsetMs) =>
                primaryRecording &&
                playAudioAtOffset(
                  primaryRecording.dataUrl,
                  offsetMs,
                  primaryRecording.durationMs,
                )
              }
              onTogglePlayPause={handleTogglePlayPause}
              onCycleRate={handleCyclePlaybackRate}
              onStopRecording={() => void handleStartVoice()}
              onStartRecording={() => void handleStartVoice()}
              onInsertIntoNote={() => {
                if (!primaryRecording) return;
                const lines = primaryRecording.segments
                  .map((s) => `[${formatDurationMs(s.offsetMs)}] ${s.speaker}: ${s.text}`)
                  .join('\n');
                handleUpdatePageText(`${activePage.textLayer}\n\n## 전사록\n${lines}`);
                notify('전사 텍스트를 노트에 삽입했습니다.');
              }}
              onChangeTranslationMode={(mode) =>
                handleUpdateSettings({ ...settings, translationMode: mode })
              }
              onOpenLanguageModal={() => setLangModalOpen(true)}
              onRenameSpeaker={handleRenameSpeaker}
            />

            {/* Full-Width E-Ink Handwriting & Click-to-Speak Canvas */}
            <div className="editor-canvas-region">
              <InkCanvas
                pageId={activePage.id}
                template={activePage.template}
                backgroundImage={activePage.backgroundImage}
                textLayer={activePage.textLayer}
                strokes={activePage.strokes}
                timeMarks={activePage.timeMarks}
                showSyncMarkers={settings.showSyncMarkers}
                clickToSpeak={settings.clickToSpeak}
                pen={penKind}
                shade={penShade}
                baseWidth={penWidth}
                toolMode={toolMode}
                activeRecordingId={isRecording ? activeRecordingId : undefined}
                getRecordingOffsetMs={() => voiceSessionRef.current?.getElapsedMs() ?? 0}
                highlightAudioTimeMs={playbackHighlightMs}
                undoSignal={undoSignal}
                redoSignal={redoSignal}
                onChangeStrokes={handleUpdatePageStrokes}
                onChangeTextLayer={handleUpdatePageText}
                onSeekAudio={handleSeekAudio}
                onLassoAction={handleLassoAction}
                refreshNonce={refreshNonce}
              />
            </div>
          </div>
        )}

        {view === 'mindmap' && (
          <div className="subview-frame">
            <div className="subview-top-nav">
              <button type="button" className="btn-outline-sm" onClick={() => setView('launcher')}>
                ← 홈 런처
              </button>
              <h2>마인드맵 · 지식 구조화</h2>
            </div>
            <MindMapEditor
              mindMaps={mindMaps}
              settings={settings}
              onSaveMindMap={(doc) => {
                void saveMindMap(doc).then(() =>
                  setMindMaps((prev) =>
                    prev.some((m) => m.id === doc.id)
                      ? prev.map((m) => (m.id === doc.id ? doc : m))
                      : [doc, ...prev],
                  ),
                );
              }}
              onInsertMarkdownToNote={(md) => {
                if (activeNote && activePage) {
                  handleUpdatePageText(`${activePage.textLayer}\n\n${md}`);
                  setView('editor');
                  notify('마인드맵 마크다운을 현재 노트에 삽입했습니다.');
                }
              }}
            />
          </div>
        )}

        {view === 'schedule' && (
          <div className="subview-frame">
            <div className="subview-top-nav">
              <button type="button" className="btn-outline-sm" onClick={() => setView('launcher')}>
                ← 홈 런처
              </button>
              <h2>Schedule · To-Do (.ics 연동)</h2>
            </div>
            <CalendarTodoPanel
              events={events}
              todos={todos}
              onAddEvent={(ev) => {
                void saveEvent(ev).then(() => setEvents((prev) => [...prev, ev]));
              }}
              onDeleteEvent={(id) => {
                void deleteEvent(id).then(() =>
                  setEvents((prev) => prev.filter((ev) => ev.id !== id)),
                );
              }}
              onAddTodo={(todo) => {
                void saveTodo(todo).then(() => setTodos((prev) => [todo, ...prev]));
              }}
              onToggleTodo={(id) => {
                const target = todos.find((t) => t.id === id);
                if (!target) return;
                const updated = { ...target, done: !target.done };
                void saveTodo(updated).then(() =>
                  setTodos((prev) => prev.map((t) => (t.id === id ? updated : t))),
                );
              }}
              onDeleteTodo={(id) => {
                void deleteTodo(id).then(() =>
                  setTodos((prev) => prev.filter((t) => t.id !== id)),
                );
              }}
            />
          </div>
        )}

        {view === 'settings' && (
          <div className="subview-frame">
            <div className="subview-top-nav">
              <button type="button" className="btn-outline-sm" onClick={() => setView('launcher')}>
                ← 홈 런처
              </button>
              <h2>기계 · 프론트라이트 · AI · 백업</h2>
            </div>
            <div className="settings-panel eink-card">
              <div className="form-grid-2">
                <label>
                  프론트라이트 밝기 ({settings.readingLight}%)
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.readingLight}
                    onChange={(e) =>
                      handleUpdateSettings({ ...settings, readingLight: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  AI 제공자
                  <select
                    value={settings.provider}
                    onChange={(e) =>
                      handleUpdateSettings({
                        ...settings,
                        provider: e.target.value as AiSettings['provider'],
                      })
                    }
                  >
                    <option value="local">오프라인 로컬 AI</option>
                    <option value="openai">OpenAI (gpt-5)</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="custom">사용자 엔드포인트</option>
                  </select>
                </label>
              </div>
              <div className="backup-actions">
                <button
                  type="button"
                  className="btn-ink"
                  onClick={async () => {
                    const json = await exportMeokbitBackup();
                    await exportTextArtifact(
                      `meokbit-backup-${new Date().toISOString().slice(0, 10)}.json`,
                      json,
                      'application/json',
                    );
                  }}
                >
                  전체 데이터 JSON 백업
                </button>
                <label className="btn-outline file-btn">
                  JSON 백업 복원
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      await importMeokbitBackup(await f.text());
                      window.location.reload();
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </EInkStage>

      {/* Modals & Overlays */}
      <LanguageModeModal
        open={langModalOpen}
        onClose={() => setLangModalOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      {activeNote && (
        <ShareExportModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          note={activeNote}
          onSaveExportedAudio={async (file) => {
            await saveAudioFile(file);
            setAudioFiles((prev) => [file, ...prev]);
          }}
          onOpenFilesAudio={() => {
            setLauncherSection('files-audio');
            setView('launcher');
          }}
          onNotify={notify}
        />
      )}

      {activeNote && (
        <RetranscribeModal
          open={retransModalOpen}
          onClose={() => setRetransModalOpen(false)}
          recordings={activeNote.recordings}
          defaultSpeechLang={settings.speechLang}
          defaultTranslateLang={settings.translateLang}
          onRunRetranscribe={handleRunRetranscribe}
        />
      )}

      <MeetingMinutesView
        open={minutesOpen}
        isGenerating={minutesGenerating}
        minutes={minutesData}
        onClose={() => setMinutesOpen(false)}
        onInsertIntoNote={(markdown) => {
          if (activeNote && activePage) {
            handleUpdatePageText(`${activePage.textLayer}\n\n${markdown}`);
            void persistNote({ ...activeNote, aiSummary: markdown });
            setMinutesOpen(false);
            notify('Completed — Meeting Minutes를 노트에 삽입했습니다.');
          }
        }}
        onAddActionItemsToTodo={(items) => {
          for (const item of items) {
            const todo: TodoTask = {
              id: `td_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              title: `[${item.owner}] ${item.task}`,
              done: false,
              sourceNoteId: activeNote?.id,
              createdAt: Date.now(),
            };
            void saveTodo(todo).then(() => setTodos((prev) => [todo, ...prev]));
          }
          notify(`${items.length}개의 실행 과제를 To-Do에 등록했습니다.`);
        }}
        onShareMinutes={(markdown) => {
          if (activeNote) {
            void exportTextArtifact(`${activeNote.title}-minutes.md`, markdown, 'text/markdown');
            notify('Meeting Minutes 마크다운을 내보냈습니다.');
          }
        }}
      />

      <AiAidSheet
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        activeNote={activeNote}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        initialPrompt={aiInitialPrompt}
        initialLassoImage={aiInitialImage}
        onInsertToNote={(text) => {
          if (activePage) {
            handleUpdatePageText(`${activePage.textLayer}\n\n${text}`);
            setAiModalOpen(false);
            notify('AI 결과를 노트에 삽입했습니다.');
          }
        }}
        onAddTodo={(todo) => {
          void saveTodo(todo).then(() => setTodos((prev) => [todo, ...prev]));
        }}
        onAddEvent={(ev) => {
          void saveEvent(ev).then(() => setEvents((prev) => [...prev, ev]));
        }}
        onUpdateNoteSummary={(summary) => {
          if (activeNote) {
            void persistNote({ ...activeNote, aiSummary: summary });
          }
        }}
      />
    </div>
  );
}

export default App;
