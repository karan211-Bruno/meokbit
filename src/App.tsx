import React, { useEffect, useRef, useState } from 'react';
import {
  AiSettings,
  InkStroke,
  MindMapDoc,
  NoteBook,
  PaperTemplateId,
  PenKind,
  ScheduleEvent,
  TodoTask,
} from './types';
import {
  createStarterData,
  DEFAULT_AI_SETTINGS,
  deleteEvent,
  deleteNote,
  deleteTodo,
  exportMeokbitBackup,
  importMeokbitBackup,
  listEvents,
  listMindMaps,
  listNotes,
  listTodos,
  loadAiSettings,
  saveAiSettings,
  saveEvent,
  saveMindMap,
  saveNote,
  saveTodo,
} from './lib/db';
import { PAPER_TEMPLATES } from './lib/templates';
import {
  startSyncedVoiceSession,
  SUPPORTED_SPEECH_LANGUAGES,
  TRANSLATION_TARGETS,
} from './lib/voiceRecorder';
import { quickTranslateLine } from './lib/aiAssistant';
import { importDocumentAsNote } from './lib/docLoader';
import { exportTextArtifact } from './lib/native';
import { EInkStage } from './components/EInkStage';
import { InkCanvas, LassoSelection } from './components/InkCanvas';
import { AiAidSheet } from './components/AiAidSheet';
import { MindMapEditor } from './components/MindMapEditor';
import { CalendarTodoPanel } from './components/CalendarTodoPanel';

type NavTab = 'notes' | 'mindmap' | 'calendar' | 'settings';

export function App() {
  const [tab, setTab] = useState<NavTab>('notes');
  const [notes, setNotes] = useState<NoteBook[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [todos, setTodos] = useState<TodoTask[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [mindMaps, setMindMaps] = useState<MindMapDoc[]>([]);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  // Canvas & Pen tools
  const [toolMode, setToolMode] = useState<'pen' | 'eraser' | 'lasso' | 'text'>('pen');
  const [penKind, setPenKind] = useState<PenKind>('fountain');
  const [penShade, setPenShade] = useState<string>('#121212');
  const [penWidth, setPenWidth] = useState<number>(2.4);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Voice & Sync state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [activeRecordingId, setActiveRecordingId] = useState<string | undefined>(undefined);
  const [playbackHighlightMs, setPlaybackHighlightMs] = useState<number | null>(null);
  const voiceSessionRef = useRef<{
    stop: () => Promise<{ dataUrl: string; mimeType: string; durationMs: number }>;
    getElapsedMs: () => number;
  } | null>(null);
  const liveSegmentsRef = useRef<
    Array<{ id: string; offsetMs: number; speaker: string; text: string; translated?: string }>
  >([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Quick memo & AI Aid modal
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

      if (loadedNotes.length === 0) {
        const starter = createStarterData();
        await saveNote(starter.note);
        for (const t of starter.todos) await saveTodo(t);
        for (const ev of starter.events) await saveEvent(ev);
        await saveMindMap(starter.mindmap);
        loadedNotes = [starter.note];
        loadedTodos = starter.todos;
        loadedEvents = starter.events;
        loadedMaps = [starter.mindmap];
      }

      setNotes(loadedNotes);
      setActiveNoteId(loadedNotes[0]?.id || '');
      setTodos(loadedTodos);
      setEvents(loadedEvents);
      setMindMaps(loadedMaps);
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

  const notify = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => setStatusMessage(''), 3200);
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

  const handleCreateNote = async (template: PaperTemplateId = 'meeting') => {
    const note: NoteBook = {
      id: `note_${Date.now()}`,
      title: `새 노트 ${notes.length + 1}`,
      category: template === 'meeting' ? 'meeting' : 'study',
      currentPage: 0,
      pages: [
        {
          id: `pg_${Date.now()}`,
          index: 0,
          template,
          textLayer: '',
          strokes: [],
        },
      ],
      recordings: [],
      updatedAt: Date.now(),
    };
    await persistNote(note);
    setActiveNoteId(note.id);
    setTab('notes');
    notify('새 E-Ink 노트를 생성했습니다.');
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
      idx === activeNote.currentPage ? { ...p, strokes } : p
    );
    void persistNote({ ...activeNote, pages });
  };

  const handleUpdatePageText = (textLayer: string) => {
    if (!activeNote || !activePage) return;
    const pages = activeNote.pages.map((p, idx) =>
      idx === activeNote.currentPage ? { ...p, textLayer } : p
    );
    void persistNote({ ...activeNote, pages });
  };

  const handleChangeTemplate = (template: PaperTemplateId) => {
    if (!activeNote || !activePage) return;
    const pages = activeNote.pages.map((p, idx) =>
      idx === activeNote.currentPage ? { ...p, template } : p
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
      },
    ];
    void persistNote({
      ...activeNote,
      pages: nextPages,
      currentPage: nextPages.length - 1,
    });
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
                  speaker: '화자 1',
                  text: '(음성 녹음 완료 — 필기와 시간축이 동기화되었습니다)',
                },
              ];
        const memo = {
          id: activeRecordingId || `rec_${Date.now()}`,
          title: `녹음 ${activeNote.recordings.length + 1}`,
          createdAt: Date.now(),
          durationMs: done.durationMs,
          mimeType: done.mimeType,
          dataUrl: done.dataUrl,
          language: settings.speechLang,
          targetLanguage: settings.translateLang,
          segments: capturedSegments,
        };
        liveSegmentsRef.current = [];
        await persistNote({
          ...activeNote,
          recordings: [memo, ...activeNote.recordings],
        });
        notify(`음성 녹음 및 전사(${capturedSegments.length}구간)가 노트에 저장되었습니다.`);
      }
      return;
    }

    const recId = `rec_${Date.now()}`;
    liveSegmentsRef.current = [];
    setActiveRecordingId(recId);
    setRecordingMs(0);
    setIsRecording(true);
    try {
      const session = await startSyncedVoiceSession(
        settings.speechLang,
        (text, isFinal, offsetMs) => {
          if (!isFinal) return;
          const seg = {
            id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            offsetMs,
            speaker: '화자 1',
            text,
            translated: quickTranslateLine(text, settings.translateLang),
          };
          liveSegmentsRef.current.push(seg);
          setNotes((prev) =>
            prev.map((n) => {
              if (n.id !== activeNote.id) return n;
              const line = `\n[${Math.floor(offsetMs / 1000)}s ${seg.speaker}] ${text}`;
              const updatedPages = n.pages.map((p, i) =>
                i === n.currentPage ? { ...p, textLayer: p.textLayer + line } : p
              );
              return { ...n, pages: updatedPages };
            })
          );
        },
        (err) => notify(err)
      );
      voiceSessionRef.current = session;
      notify('필기-음성 실시간 동기화 녹음을 시작했습니다.');
    } catch {
      setIsRecording(false);
      setActiveRecordingId(undefined);
      notify('마이크 권한을 확인할 수 없어 음성 녹음을 시작하지 못했습니다.');
    }
  };

  const handleSeekAudio = (recordingId: string, offsetMs: number) => {
    const rec = activeNote?.recordings.find((r) => r.id === recordingId);
    if (!rec || !rec.dataUrl) {
      setPlaybackHighlightMs(offsetMs);
      notify(`필기 시점(${Math.round(offsetMs / 1000)}초) 하이라이트`);
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    if (audio.src !== rec.dataUrl) {
      audio.src = rec.dataUrl;
    }
    audio.currentTime = offsetMs / 1000;
    setPlaybackHighlightMs(offsetMs);
    audio.play().catch(() => undefined);
    notify(`${Math.round(offsetMs / 1000)}초 시점부터 음성을 재생합니다.`);
  };

  const handleImportDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      notify(`"${file.name}" 불러오는 중...`);
      const imported = await importDocumentAsNote(file);
      await persistNote(imported);
      setActiveNoteId(imported.id);
      setTab('notes');
      notify(`"${file.name}" (${imported.pages.length}페이지) 가져오기 완료`);
    } catch (err) {
      notify(`문서 불러오기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleLassoAction = (
    action: 'ai-ask' | 'to-markdown' | 'to-todo' | 'delete',
    selection: LassoSelection
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
        : '선택한 손글씨 영역의 핵심 개념과 보충 설명을 정리해 줘.'
    );
    setAiModalOpen(true);
  };

  const handleUpdateSettings = (next: AiSettings) => {
    setSettings(next);
    saveAiSettings(next);
  };

  return (
    <div className="meokbit-shell">
      {/* Left E-Ink Launcher Rail (AINOTE 2 Style) */}
      <aside className="eink-sidebar" aria-label="먹빛 탐색 메뉴">
        <div className="brand-badge">
          <div className="brand-mark">墨</div>
          <div>
            <h1>먹빛</h1>
            <span>AINOTE Studio</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={tab === 'notes' ? 'is-active' : ''}
            onClick={() => setTab('notes')}
          >
            필기 · 문서
          </button>
          <button
            type="button"
            className={tab === 'mindmap' ? 'is-active' : ''}
            onClick={() => setTab('mindmap')}
          >
            마인드맵
          </button>
          <button
            type="button"
            className={tab === 'calendar' ? 'is-active' : ''}
            onClick={() => setTab('calendar')}
          >
            일정 · To-Do
          </button>
          <button
            type="button"
            className={tab === 'settings' ? 'is-active' : ''}
            onClick={() => setTab('settings')}
          >
            기계·AI 설정
          </button>
        </nav>

        <div className="sidebar-ai-hardware-btn">
          <button
            type="button"
            className="btn-ink full-width"
            onClick={() => {
              setAiInitialImage(undefined);
              setAiInitialPrompt(undefined);
              setAiModalOpen(true);
            }}
          >
            상단 AI 버튼 / AI Aid
          </button>
        </div>

        <div className="sidebar-notes-list">
          <div className="sidebar-section-head">
            <span>노트북 ({notes.length})</span>
            <button type="button" className="btn-ghost-sm" onClick={() => handleCreateNote('meeting')}>
              + 새 노트
            </button>
          </div>
          <ul>
            {notes.map((n) => (
              <li key={n.id} className={n.id === activeNote?.id ? 'is-selected' : ''}>
                <button
                  type="button"
                  className="note-item-btn"
                  onClick={() => {
                    setActiveNoteId(n.id);
                    setTab('notes');
                  }}
                >
                  <strong>{n.title}</strong>
                  <span>
                    {n.pages.length}쪽 · 녹음 {n.recordings.length}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-ghost-sm"
                  aria-label={`${n.title} 삭제`}
                  onClick={() => handleDeleteNote(n.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main 300PPI E-Ink Workspace */}
      <main className="eink-main">
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
            <div className="eink-toast" role="status">
              {statusMessage}
            </div>
          )}

          {tab === 'notes' && activeNote && activePage && (
            <div className="notes-workspace">
              {/* Top Note & Pen Toolbar */}
              <header className="note-topbar">
                <div className="note-title-row">
                  <input
                    type="text"
                    className="note-title-input"
                    value={activeNote.title}
                    onChange={(e) => void persistNote({ ...activeNote, title: e.target.value })}
                    aria-label="노트 제목"
                  />
                  <label className="btn-outline-sm file-btn">
                    PDF·TXT 불러오기
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                      onChange={handleImportDoc}
                      hidden
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-outline-sm"
                    onClick={() => {
                      const md = `# ${activeNote.title}\n\n${activeNote.pages
                        .map((p, i) => `## Page ${i + 1}\n\n${p.textLayer}`)
                        .join('\n\n')}`;
                      void exportTextArtifact(`${activeNote.title}.md`, md, 'text/markdown');
                    }}
                  >
                    마크다운 내보내기
                  </button>
                </div>

                <div className="note-tool-strip">
                  <div className="tool-group">
                    <button
                      type="button"
                      className={toolMode === 'pen' ? 'is-active' : ''}
                      onClick={() => setToolMode('pen')}
                    >
                      펜 필기
                    </button>
                    <button
                      type="button"
                      className={toolMode === 'eraser' ? 'is-active' : ''}
                      onClick={() => setToolMode('eraser')}
                    >
                      지우개
                    </button>
                    <button
                      type="button"
                      className={toolMode === 'lasso' ? 'is-active' : ''}
                      onClick={() => setToolMode('lasso')}
                    >
                      올가미 AI
                    </button>
                    <button
                      type="button"
                      className={toolMode === 'text' ? 'is-active' : ''}
                      onClick={() => setToolMode('text')}
                    >
                      텍스트 편집
                    </button>
                  </div>

                  <div className="tool-group">
                    <select
                      value={penKind}
                      onChange={(e) => setPenKind(e.target.value as PenKind)}
                      aria-label="펜 종류"
                    >
                      <option value="fountain">만년필 (필압+속도)</option>
                      <option value="ballpoint">볼펜</option>
                      <option value="pencil">연필</option>
                      <option value="brush">붓펜</option>
                      <option value="highlighter">형광펜</option>
                    </select>
                    <select
                      value={penShade}
                      onChange={(e) => setPenShade(e.target.value)}
                      aria-label="잉크 농도"
                    >
                      <option value="#121212">먹색 #121212</option>
                      <option value="#404040">진회색 #404040</option>
                      <option value="#757575">중회색 #757575</option>
                      <option value="#a8a8a8">연회색 #a8a8a8</option>
                    </select>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={0.5}
                      value={penWidth}
                      onChange={(e) => setPenWidth(Number(e.target.value))}
                      title={`굵기 ${penWidth}`}
                    />
                  </div>

                  <div className="tool-group">
                    <select
                      value={activePage.template}
                      onChange={(e) => handleChangeTemplate(e.target.value as PaperTemplateId)}
                      aria-label="속지 템플릿"
                    >
                      {PAPER_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
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
                      이전
                    </button>
                    <span className="page-counter">
                      {activeNote.currentPage + 1}/{activeNote.pages.length}
                    </span>
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
                      다음
                    </button>
                    <button type="button" className="btn-outline-sm" onClick={handleAddPage}>
                      +쪽
                    </button>
                  </div>
                </div>

                {/* Live Voice Sync & 16-language transcription bar */}
                <div className="voice-sync-bar">
                  <button
                    type="button"
                    className={`btn-voice ${isRecording ? 'is-recording' : ''}`}
                    onClick={handleStartVoice}
                  >
                    {isRecording
                      ? `녹음 중지 (${Math.floor(recordingMs / 1000)}초)`
                      : '실시간 음성 녹음 + 필기 동기화'}
                  </button>

                  <label className="inline-select">
                    전사 언어
                    <select
                      value={settings.speechLang}
                      onChange={(e) =>
                        handleUpdateSettings({ ...settings, speechLang: e.target.value })
                      }
                    >
                      {SUPPORTED_SPEECH_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="inline-select">
                    번역
                    <select
                      value={settings.translateLang}
                      onChange={(e) =>
                        handleUpdateSettings({ ...settings, translateLang: e.target.value })
                      }
                    >
                      {TRANSLATION_TARGETS.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="inline-select" title="프론트라이트 밝기">
                    조명 {settings.readingLight}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.readingLight}
                      onChange={(e) =>
                        handleUpdateSettings({
                          ...settings,
                          readingLight: Number(e.target.value),
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="btn-ink-sm"
                    onClick={() => {
                      setAiInitialImage(undefined);
                      setAiInitialPrompt(undefined);
                      setAiModalOpen(true);
                    }}
                  >
                    AI Aid 회의 요약
                  </button>
                </div>
              </header>

              <div className="note-editor-split">
                <InkCanvas
                  pageId={activePage.id}
                  template={activePage.template}
                  backgroundImage={activePage.backgroundImage}
                  textLayer={activePage.textLayer}
                  strokes={activePage.strokes}
                  pen={penKind}
                  shade={penShade}
                  baseWidth={penWidth}
                  toolMode={toolMode}
                  activeRecordingId={isRecording ? activeRecordingId : undefined}
                  getRecordingOffsetMs={() => voiceSessionRef.current?.getElapsedMs() ?? 0}
                  highlightAudioTimeMs={playbackHighlightMs}
                  onChangeStrokes={handleUpdatePageStrokes}
                  onChangeTextLayer={handleUpdatePageText}
                  onSeekAudio={handleSeekAudio}
                  onLassoAction={handleLassoAction}
                  refreshNonce={refreshNonce}
                />

                <aside className="transcript-side-pane" aria-label="전사 및 번역 타임라인">
                  <h3>음성 전사 · 필기 동기화</h3>
                  {activeNote.aiSummary && (
                    <div className="summary-box">
                      <strong>AI 요약</strong>
                      <pre>{activeNote.aiSummary}</pre>
                    </div>
                  )}
                  {activeNote.recordings.length === 0 ? (
                    <p className="meta-text">
                      녹음 버튼을 누른 상태에서 필기하면, 각 획에 음성 타임스탬프가 기록됩니다.
                    </p>
                  ) : (
                    activeNote.recordings.map((rec) => (
                      <div key={rec.id} className="recording-card">
                        <div className="rec-card-head">
                          <strong>{rec.title}</strong>
                          <span>{Math.round(rec.durationMs / 1000)}초</span>
                        </div>
                        <ul className="segment-list">
                          {rec.segments.map((seg) => (
                            <li key={seg.id}>
                              <button
                                type="button"
                                className="seg-seek-btn"
                                onClick={() => handleSeekAudio(rec.id, seg.offsetMs)}
                              >
                                [{Math.floor(seg.offsetMs / 1000)}s] {seg.speaker}
                              </button>
                              <p>{seg.text}</p>
                              {seg.translated && (
                                <p className="translated-line">{seg.translated}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </aside>
              </div>
            </div>
          )}

          {tab === 'mindmap' && (
            <MindMapEditor
              mindMaps={mindMaps}
              settings={settings}
              onSaveMindMap={(doc) => {
                void saveMindMap(doc).then(() =>
                  setMindMaps((prev) =>
                    prev.some((m) => m.id === doc.id)
                      ? prev.map((m) => (m.id === doc.id ? doc : m))
                      : [doc, ...prev]
                  )
                );
              }}
              onInsertMarkdownToNote={(md) => {
                if (activeNote && activePage) {
                  handleUpdatePageText(`${activePage.textLayer}\n\n${md}`);
                  setTab('notes');
                  notify('마인드맵 마크다운을 현재 노트에 삽입했습니다.');
                }
              }}
            />
          )}

          {tab === 'calendar' && (
            <CalendarTodoPanel
              events={events}
              todos={todos}
              onAddEvent={(ev) => {
                void saveEvent(ev).then(() => setEvents((prev) => [...prev, ev]));
              }}
              onDeleteEvent={(id) => {
                void deleteEvent(id).then(() =>
                  setEvents((prev) => prev.filter((ev) => ev.id !== id))
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
                  setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)))
                );
              }}
              onDeleteTodo={(id) => {
                void deleteTodo(id).then(() =>
                  setTodos((prev) => prev.filter((t) => t.id !== id))
                );
              }}
            />
          )}

          {tab === 'settings' && (
            <div className="settings-panel eink-card">
              <h2>기계 · 프론트라이트 · 데이터 백업</h2>
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
                      'application/json'
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
          )}
        </EInkStage>
      </main>

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
