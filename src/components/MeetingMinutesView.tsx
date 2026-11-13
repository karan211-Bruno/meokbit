import React, { useEffect, useState } from 'react';
import type { StructuredMeetingMinutes } from '../lib/aiAssistant';

interface MeetingMinutesViewProps {
  open: boolean;
  isGenerating: boolean;
  minutes: StructuredMeetingMinutes | null;
  onClose: () => void;
  onInsertIntoNote: (markdown: string) => void;
  onAddActionItemsToTodo: (items: Array<{ owner: string; task: string; due?: string }>) => void;
  onShareMinutes: (markdown: string) => void;
}

export const MeetingMinutesView: React.FC<MeetingMinutesViewProps> = ({
  open,
  isGenerating,
  minutes,
  onClose,
  onInsertIntoNote,
  onAddActionItemsToTodo,
  onShareMinutes,
}) => {
  const [editMode, setEditMode] = useState(false);
  const [draftMarkdown, setDraftMarkdown] = useState('');

  useEffect(() => {
    if (minutes) {
      setDraftMarkdown(minutes.markdown);
    }
  }, [minutes]);

  if (!open) return null;

  return (
    <div className="minutes-fullscreen" data-testid="meeting-minutes-view">
      <header className="minutes-topbar">
        <div className="minutes-head-left">
          <button type="button" className="btn-outline-sm" onClick={onClose}>
            ← 노트로 돌아가기
          </button>
          <div>
            <h2>✦ AI Aide · Meeting Minutes</h2>
            <span>참석자 · 안건 · 논의 요약 · 확인 사항 · 실행 과제</span>
          </div>
        </div>

        <div className="minutes-head-actions">
          <button
            type="button"
            className={`btn-outline-sm ${editMode ? 'is-active-eink' : ''}`}
            data-testid="minutes-toggle-edit"
            onClick={() => setEditMode((v) => !v)}
          >
            T {editMode ? '미리보기' : '직접 편집'}
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            disabled={!minutes || isGenerating}
            onClick={() => minutes && onAddActionItemsToTodo(minutes.actionItems)}
          >
            + 실행과제 To-Do 일괄등록
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            disabled={!draftMarkdown || isGenerating}
            onClick={() => onShareMinutes(draftMarkdown)}
          >
            ⤴ Share
          </button>
          <button
            type="button"
            className="btn-ink"
            data-testid="minutes-insert-btn"
            disabled={!draftMarkdown || isGenerating}
            onClick={() => onInsertIntoNote(draftMarkdown)}
          >
            Insert into note
          </button>
        </div>
      </header>

      <div className="minutes-body">
        {isGenerating ? (
          <div className="minutes-thinking-box" data-testid="minutes-thinking">
            <div className="thinking-spinner" />
            <strong>Engaged in deep thinking...</strong>
            <p className="meta-text">
              회의 필기와 화자 구분 전사 내용을 분석하여 구조화된 Meeting Minutes를 작성하고 있습니다.
            </p>
          </div>
        ) : !minutes ? null : editMode ? (
          <textarea
            className="minutes-markdown-editor"
            value={draftMarkdown}
            onChange={(e) => setDraftMarkdown(e.target.value)}
            aria-label="Meeting Minutes 직접 편집"
          />
        ) : (
          <article className="minutes-sheet">
            <h1>{minutes.title}</h1>
            <div className="minutes-meta-grid">
              <div>
                <strong>Date</strong>
                <span>{minutes.dateLabel}</span>
              </div>
              <div>
                <strong>Attendees</strong>
                <span>{minutes.attendees.join(', ')}</span>
              </div>
            </div>

            <section className="minutes-section">
              <h3>Agenda</h3>
              <ul>
                {minutes.agenda.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </section>

            <section className="minutes-section">
              <h3>Key Discussion Points</h3>
              {minutes.discussionPoints.map((dp, i) => (
                <div key={i} className="minutes-subblock">
                  <h4>{dp.heading}</h4>
                  <ul>
                    {dp.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {minutes.quote && <blockquote className="minutes-quote">{minutes.quote}</blockquote>}
            </section>

            <section className="minutes-section">
              <h3>Items to be Confirmed</h3>
              <ul>
                {minutes.itemsToConfirm.map((c, i) => (
                  <li key={i}>☐ {c}</li>
                ))}
              </ul>
            </section>

            <section className="minutes-section">
              <h3>Action Items</h3>
              <ul>
                {minutes.actionItems.map((ai, i) => (
                  <li key={i}>
                    <strong>{ai.owner}:</strong> {ai.task}{' '}
                    {ai.due && <span className="eink-badge">{ai.due}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </article>
        )}
      </div>
    </div>
  );
};
