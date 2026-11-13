import React, { useMemo, useRef, useState } from 'react';
import type { AudioMemo, TranscriptSegment, TranslationDisplayMode } from '../types';
import { formatDurationMs, formatShortTimeMs } from '../lib/formatTime';

interface TranscriptionPopupProps {
  open: boolean;
  heightPx: number;
  onChangeHeight: (nextHeight: number) => void;
  onHide: () => void;
  isRecording: boolean;
  recordingMs: number;
  activeMemo: AudioMemo | null;
  liveSegments: TranscriptSegment[];
  playbackTimeMs: number;
  isPlaying: boolean;
  playbackRate: number;
  translationMode: TranslationDisplayMode;
  speechLang: string;
  translateLang: string;
  speakerIdEnabled: boolean;
  onToggleSpeakerId: () => void;
  onAddTag: () => void;
  onSeekOffset: (offsetMs: number) => void;
  onTogglePlayPause: () => void;
  onCycleRate: () => void;
  onStopRecording: () => void;
  onStartRecording: () => void;
  onInsertIntoNote: () => void;
  onChangeTranslationMode: (mode: TranslationDisplayMode) => void;
  onOpenLanguageModal: () => void;
  onRenameSpeaker: (
    segmentId: string,
    oldSpeaker: string,
    newSpeaker: string,
    scope: 'here' | 'all',
  ) => void;
}

export const TranscriptionPopup: React.FC<TranscriptionPopupProps> = ({
  open,
  heightPx,
  onChangeHeight,
  onHide,
  isRecording,
  recordingMs,
  activeMemo,
  liveSegments,
  playbackTimeMs,
  isPlaying,
  playbackRate,
  translationMode,
  speechLang,
  translateLang,
  speakerIdEnabled,
  onToggleSpeakerId,
  onAddTag,
  onSeekOffset,
  onTogglePlayPause,
  onCycleRate,
  onStopRecording,
  onStartRecording,
  onInsertIntoNote,
  onChangeTranslationMode,
  onOpenLanguageModal,
  onRenameSpeaker,
}) => {
  const [renamingSeg, setRenamingSeg] = useState<TranscriptSegment | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState('');
  const dragStartRef = useRef<{ startY: number; startH: number } | null>(null);

  const segments = isRecording ? liveSegments : activeMemo?.segments || [];
  const totalDurationMs = isRecording
    ? Math.max(recordingMs, 1000)
    : Math.max(activeMemo?.durationMs || 1000, 1000);
  const currentMs = isRecording ? recordingMs : playbackTimeMs;
  const tags = activeMemo?.tags || [];

  const activeSegId = useMemo(() => {
    if (segments.length === 0) return null;
    let best = segments[0];
    for (const seg of segments) {
      if (seg.offsetMs <= currentMs + 800) {
        best = seg;
      }
    }
    return best.id;
  }, [segments, currentMs]);

  if (!open) return null;

  const handleDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { startY: e.clientY, startH: heightPx };
  };

  const handleDragPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const delta = e.clientY - dragStartRef.current.startY;
    const nextH = dragStartRef.current.startH + delta;
    if (nextH < 95) {
      dragStartRef.current = null;
      onHide();
      return;
    }
    onChangeHeight(Math.max(150, Math.min(440, nextH)));
  };

  const handleDragPointerUp = () => {
    dragStartRef.current = null;
  };

  return (
    <section
      className="transcription-split-pane"
      style={{ height: `${heightPx}px` }}
      aria-label="실시간 전사 및 오디오 재생 패널"
      data-testid="transcription-popup"
    >
      {/* Top Toolbar */}
      <div className="trans-pane-head">
        <div className="trans-head-left">
          <span className={`rec-status-dot ${isRecording ? 'is-live' : ''}`} />
          <strong>
            {isRecording
              ? `녹음 중 ${formatDurationMs(recordingMs)}`
              : activeMemo?.title || '녹음 내역 없음'}
          </strong>

          {/* Live / Playback E-Ink Waveform */}
          <div className={`eink-waveform ${isRecording || isPlaying ? 'is-animating' : ''}`} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>

          <button
            type="button"
            className={`btn-outline-sm ${speakerIdEnabled ? 'is-active-eink' : ''}`}
            data-testid="toggle-speaker-id"
            onClick={onToggleSpeakerId}
            title="화자 구분(Speaker ID) 표시 전환"
          >
            👥 화자 {speakerIdEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            className="btn-outline-sm"
            data-testid="add-recording-tag"
            onClick={onAddTag}
            title="현재 시점 태그 + 노트에 타임마크 기록"
          >
            🏷 Tag
          </button>
        </div>

        <div className="trans-head-right">
          <div className="seg-mode-pills" role="group" aria-label="전사 번역 표시 모드">
            {(['original', 'translation', 'both'] as TranslationDisplayMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={translationMode === m ? 'is-selected' : ''}
                onClick={() => onChangeTranslationMode(m)}
              >
                {m === 'original' ? '원문' : m === 'translation' ? '번역' : '원문+번역'}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-outline-sm"
            data-testid="open-lang-modal-btn"
            onClick={onOpenLanguageModal}
          >
            🌐 {speechLang.split('-')[0].toUpperCase()}→{translateLang.toUpperCase()}
          </button>

          {!isRecording ? (
            <>
              <button type="button" className="btn-outline-sm" onClick={onCycleRate}>
                {playbackRate}x
              </button>
              <button
                type="button"
                className="btn-ink-sm"
                data-testid="toggle-play-audio"
                onClick={onTogglePlayPause}
                disabled={!activeMemo}
              >
                {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
              </button>
              <button type="button" className="btn-outline-sm" onClick={onStartRecording}>
                🎙 Resume
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ink-sm"
              data-testid="stop-recording-popup"
              onClick={onStopRecording}
            >
              ■ 중지 · 저장
            </button>
          )}

          <button
            type="button"
            className="btn-outline-sm"
            data-testid="insert-transcript-note"
            onClick={onInsertIntoNote}
          >
            노트 삽입
          </button>

          <button
            type="button"
            className="btn-ghost-sm"
            data-testid="hide-transcription-pane"
            onClick={onHide}
            title="패널 숨기기 (백그라운드 녹음 유지)"
          >
            ⌃ 숨김
          </button>
        </div>
      </div>

      {/* Audio Scrubber + Clickable Tag Dots */}
      <div className="trans-scrubber-row">
        <span className="time-mono">{formatShortTimeMs(currentMs)}</span>
        <div className="scrubber-track-wrap">
          <input
            type="range"
            min={0}
            max={totalDurationMs}
            value={Math.min(currentMs, totalDurationMs)}
            onChange={(e) => onSeekOffset(Number(e.target.value))}
            aria-label="음성 재생 위치 조절"
            disabled={isRecording || !activeMemo}
          />
          {!isRecording &&
            tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className="scrubber-tag-dot"
                style={{ left: `${Math.min(98, Math.max(2, (t.offsetMs / totalDurationMs) * 100))}%` }}
                title={`Tag: ${t.label} (${formatShortTimeMs(t.offsetMs)})`}
                onClick={() => onSeekOffset(t.offsetMs)}
              />
            ))}
        </div>
        <span className="time-mono">{formatShortTimeMs(totalDurationMs)}</span>
      </div>

      {/* Transcript Segment Stream */}
      <div className="trans-segments-scroll">
        {segments.length === 0 ? (
          <div className="trans-empty-msg">
            {isRecording
              ? '음성을 듣는 중입니다. 말씀하시거나 Tag 버튼을 눌러 타임마크를 남기세요.'
              : '녹음을 시작하거나 좌측 노트를 선택하면 전사 및 타임마크가 표시됩니다.'}
          </div>
        ) : (
          <ul className="trans-segments-list">
            {segments.map((seg) => {
              const isActive = seg.id === activeSegId && !isRecording;
              return (
                <li
                  key={seg.id}
                  data-testid={`segment-${seg.id}`}
                  className={`trans-seg-item ${isActive ? 'is-active-segment' : ''}`}
                >
                  <div className="trans-seg-meta">
                    <button
                      type="button"
                      className="seg-time-jump"
                      onClick={() => onSeekOffset(seg.offsetMs)}
                    >
                      [{formatDurationMs(seg.offsetMs)}]
                    </button>
                    {speakerIdEnabled && (
                      <button
                        type="button"
                        className="seg-speaker-pill"
                        data-testid={`speaker-pill-${seg.id}`}
                        onClick={() => {
                          setRenamingSeg(seg);
                          setSpeakerDraft(seg.speaker);
                        }}
                      >
                        {seg.speaker} ✎
                      </button>
                    )}
                  </div>
                  <div className="trans-seg-body" onClick={() => onSeekOffset(seg.offsetMs)}>
                    {(translationMode === 'original' || translationMode === 'both') && (
                      <p className="seg-orig-text">{seg.text}</p>
                    )}
                    {(translationMode === 'translation' || translationMode === 'both') && seg.translated && (
                      <p className="seg-trans-text">{seg.translated}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Speaker Rename Dialog (Only modify here vs Whole article) */}
      {renamingSeg && (
        <div className="eink-modal-backdrop" role="dialog" aria-modal="true" data-testid="speaker-rename-modal">
          <div className="eink-modal-card speaker-modal-card">
            <h4>Modify {renamingSeg.speaker} to</h4>
            <input
              type="text"
              value={speakerDraft}
              onChange={(e) => setSpeakerDraft(e.target.value)}
              placeholder="예: Arthur, 기획 팀장, Hope..."
              data-testid="speaker-rename-input"
              autoFocus
            />
            <div className="speaker-rename-actions">
              <button
                type="button"
                className="btn-outline"
                data-testid="rename-here-btn"
                onClick={() => {
                  const trimmed = speakerDraft.trim();
                  if (trimmed) onRenameSpeaker(renamingSeg.id, renamingSeg.speaker, trimmed, 'here');
                  setRenamingSeg(null);
                }}
              >
                Only modify here
              </button>
              <button
                type="button"
                className="btn-ink"
                data-testid="rename-all-btn"
                onClick={() => {
                  const trimmed = speakerDraft.trim();
                  if (trimmed) onRenameSpeaker(renamingSeg.id, renamingSeg.speaker, trimmed, 'all');
                  setRenamingSeg(null);
                }}
              >
                The modification applies to the whole article
              </button>
              <button type="button" className="btn-ghost-sm" onClick={() => setRenamingSeg(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draggable Split-Pane Resize Handle */}
      <div
        className="trans-drag-handle"
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
        title="드래그하여 높이 조절 (위로 끝까지 밀면 숨김)"
      >
        •••••
      </div>
    </section>
  );
};
