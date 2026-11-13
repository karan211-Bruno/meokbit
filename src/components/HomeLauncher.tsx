import React, { useEffect, useMemo, useState } from 'react';
import type { ExportedAudioFile, NoteBook, NoteFolder, PaperTemplateId } from '../types';
import { formatDurationMs } from '../lib/formatTime';

interface HomeLauncherProps {
  notes: NoteBook[];
  audioFiles: ExportedAudioFile[];
  todosCount: number;
  eventsCount: number;
  mindMapsCount: number;
  initialSection?: 'notes' | 'files-audio';
  onOpenNote: (noteId: string) => void;
  onCreateNote: (template: PaperTemplateId, folder: NoteFolder) => void;
  onDeleteNote: (noteId: string) => void;
  onImportDoc: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenTab: (tab: 'schedule' | 'mindmap' | 'settings') => void;
  onPlayAudioFile: (file: ExportedAudioFile) => void;
  onShareAudioFile: (file: ExportedAudioFile) => void;
  onDeleteAudioFile: (id: string) => void;
}

const FOLDERS: Array<{ id: NoteFolder; label: string; icon: string }> = [
  { id: 'All', label: 'All', icon: '▤' },
  { id: 'Default', label: 'Default', icon: '📄' },
  { id: 'Meetings', label: 'Meetings', icon: '🎙' },
  { id: 'Personal Goals', label: 'Personal Goals', icon: '◎' },
  { id: 'Projects', label: 'Projects', icon: '◫' },
];

export const HomeLauncher: React.FC<HomeLauncherProps> = ({
  notes,
  audioFiles,
  todosCount,
  eventsCount,
  mindMapsCount,
  initialSection = 'notes',
  onOpenNote,
  onCreateNote,
  onDeleteNote,
  onImportDoc,
  onOpenTab,
  onPlayAudioFile,
  onShareAudioFile,
  onDeleteAudioFile,
}) => {
  const [selectedFolder, setSelectedFolder] = useState<NoteFolder>('All');
  const [viewSection, setViewSection] = useState<'notes' | 'files-audio'>(initialSection);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setViewSection(initialSection);
  }, [initialSection]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) => {
      const folder = n.folder || (n.category === 'meeting' ? 'Meetings' : 'Default');
      const folderOk = selectedFolder === 'All' || folder === selectedFolder;
      if (!folderOk) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.pages.some((p) => p.textLayer.toLowerCase().includes(q))
      );
    });
  }, [notes, selectedFolder, searchQuery]);

  const folderCounts = useMemo(() => {
    const counts: Record<NoteFolder, number> = {
      All: notes.length,
      Default: 0,
      Meetings: 0,
      'Personal Goals': 0,
      Projects: 0,
    };
    for (const n of notes) {
      const f = n.folder || (n.category === 'meeting' ? 'Meetings' : 'Default');
      if (f in counts) counts[f as NoteFolder] += 1;
    }
    return counts;
  }, [notes]);

  return (
    <div className="ainote-launcher" data-testid="home-launcher">
      {/* Launcher Header */}
      <header className="launcher-topbar">
        <div className="launcher-brand">
          <div className="brand-mark">墨</div>
          <div>
            <strong>먹빛 AINOTE Studio</strong>
            <span>300PPI E-Ink Workspace · v2.0</span>
          </div>
        </div>

        <div className="launcher-search-row">
          <input
            type="search"
            className="launcher-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="노트 제목 · 필기 텍스트 검색..."
            aria-label="노트 검색"
          />
          <button
            type="button"
            className="btn-ink"
            data-testid="launcher-new-note"
            onClick={() =>
              onCreateNote(
                selectedFolder === 'Meetings' ? 'meeting' : 'lined',
                selectedFolder === 'All' ? 'Meetings' : selectedFolder,
              )
            }
          >
            + Note
          </button>
        </div>
      </header>

      {/* Authentic 2-Column E-Ink Body */}
      <div className="launcher-two-col">
        {/* Left Navigation Column */}
        <aside className="launcher-left-col" aria-label="폴더 및 저장소">
          <div className="launcher-section-label">NOTEBOOKS</div>
          <ul className="launcher-folder-list">
            {FOLDERS.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  data-testid={`folder-${f.id}`}
                  className={viewSection === 'notes' && selectedFolder === f.id ? 'is-active' : ''}
                  onClick={() => {
                    setViewSection('notes');
                    setSelectedFolder(f.id);
                  }}
                >
                  <span>
                    {f.icon} {f.label}
                  </span>
                  <span className="count-pill">{folderCounts[f.id]}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="launcher-section-label">FILES & LIBRARY</div>
          <ul className="launcher-folder-list">
            <li>
              <button
                type="button"
                data-testid="nav-files-audio"
                className={viewSection === 'files-audio' ? 'is-active' : ''}
                onClick={() => setViewSection('files-audio')}
              >
                <span>🎵 Files &gt; Audio</span>
                <span className="count-pill">{audioFiles.length}</span>
              </button>
            </li>
            <li>
              <label className="launcher-import-label">
                <span>📑 PDF · TXT 불러오기</span>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  onChange={onImportDoc}
                  hidden
                />
              </label>
            </li>
          </ul>

          <div className="launcher-section-label">QUICK TEMPLATES</div>
          <div className="quick-template-chips">
            <button type="button" onClick={() => onCreateNote('meeting', 'Meetings')}>
              + 회의록
            </button>
            <button type="button" onClick={() => onCreateNote('cornell', 'Personal Goals')}>
              + 코넬
            </button>
            <button type="button" onClick={() => onCreateNote('todo', 'Projects')}>
              + 체크리스트
            </button>
            <button type="button" onClick={() => onCreateNote('blank', 'Default')}>
              + 무지
            </button>
          </div>
        </aside>

        {/* Right Notes / Audio Files Grid */}
        <section className="launcher-right-col">
          {viewSection === 'notes' ? (
            <>
              <div className="launcher-col-head">
                <h2>
                  {selectedFolder} ({filteredNotes.length})
                </h2>
                <span className="meta-text">노트를 탭하여 필기 · 실시간 전사 스튜디오 열기</span>
              </div>
              <div className="launcher-notes-grid">
                {filteredNotes.map((n) => (
                  <article key={n.id} className="launcher-note-card">
                    <button
                      type="button"
                      className="note-card-body"
                      data-testid={`open-note-${n.id}`}
                      onClick={() => onOpenNote(n.id)}
                    >
                      <div className="note-card-badges">
                        <span className="eink-badge">{n.folder || 'Meetings'}</span>
                        {n.recordings.length > 0 && (
                          <span className="eink-badge">🎙 {n.recordings.length}</span>
                        )}
                      </div>
                      <h3>{n.title}</h3>
                      <p className="note-card-preview">
                        {n.pages[0]?.textLayer?.slice(0, 96) || '손글씨 E-Ink 캔버스 노트'}
                      </p>
                      <div className="note-card-meta">
                        <span>{n.pages.length}p · 획 {n.pages.reduce((s, p) => s + p.strokes.length, 0)}</span>
                        <span>{new Date(n.updatedAt).toLocaleDateString('ko-KR')}</span>
                      </div>
                    </button>
                    {notes.length > 1 && (
                      <button
                        type="button"
                        className="note-card-delete"
                        aria-label={`${n.title} 삭제`}
                        onClick={() => onDeleteNote(n.id)}
                      >
                        ×
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="files-audio-panel" data-testid="files-audio-view">
              <div className="launcher-col-head">
                <h2>Files &gt; Audio ({audioFiles.length})</h2>
                <span className="meta-text">
                  Share &gt; Recording Files 로 내보낸 WAV / MP3 / WebM 오디오 보관함
                </span>
              </div>
              {audioFiles.length === 0 ? (
                <div className="eink-empty-box">
                  아직 내보낸 오디오 파일이 없습니다. 노트 상단의 Share(내보내기) → Recording Files 를 실행해 보세요.
                </div>
              ) : (
                <ul className="audio-files-list">
                  {audioFiles.map((f) => (
                    <li key={f.id} className="audio-file-row">
                      <div>
                        <strong>{f.name}</strong>
                        <p className="meta-text">
                          원본 노트: {f.sourceNoteTitle} · {f.format.toUpperCase()} ·{' '}
                          {formatDurationMs(f.durationMs)} · {(f.sizeBytes / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <div className="audio-file-actions">
                        <button type="button" className="btn-ink-sm" onClick={() => onPlayAudioFile(f)}>
                          ▶ 재생
                        </button>
                        <button type="button" className="btn-outline-sm" onClick={() => onShareAudioFile(f)}>
                          ⤴ 저장/공유
                        </button>
                        <button type="button" className="btn-ghost-sm" onClick={() => onDeleteAudioFile(f.id)}>
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Bottom AINOTE App Dock */}
      <nav className="launcher-bottom-dock" aria-label="하단 앱 도크">
        <button
          type="button"
          className={viewSection === 'notes' ? 'is-active' : ''}
          onClick={() => setViewSection('notes')}
        >
          ✎ Notes ({notes.length})
        </button>
        <button type="button" onClick={() => onOpenTab('schedule')}>
          📅 Schedule ({eventsCount}/{todosCount})
        </button>
        <label className="dock-file-btn">
          📖 Reading (PDF)
          <input
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            onChange={onImportDoc}
            hidden
          />
        </label>
        <button type="button" onClick={() => onOpenTab('mindmap')}>
          🕸 MindMap ({mindMapsCount})
        </button>
        <button
          type="button"
          className={viewSection === 'files-audio' ? 'is-active' : ''}
          onClick={() => setViewSection('files-audio')}
        >
          🎵 Files ({audioFiles.length})
        </button>
        <button type="button" onClick={() => onOpenTab('settings')}>
          ⚙ Settings
        </button>
      </nav>
    </div>
  );
};
