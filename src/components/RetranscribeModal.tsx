import React, { useState } from 'react';
import type { AudioMemo } from '../types';
import { SUPPORTED_SPEECH_LANGUAGES, TRANSLATION_TARGETS } from '../lib/voiceRecorder';

interface RetranscribeModalProps {
  open: boolean;
  onClose: () => void;
  recordings: AudioMemo[];
  defaultSpeechLang: string;
  defaultTranslateLang: string;
  onRunRetranscribe: (opts: {
    recordingId: string;
    scope: 'complete' | 'rewind';
    multiplayerMode: boolean;
    speechLang: string;
    translateLang: string;
  }) => void;
}

export const RetranscribeModal: React.FC<RetranscribeModalProps> = ({
  open,
  onClose,
  recordings,
  defaultSpeechLang,
  defaultTranslateLang,
  onRunRetranscribe,
}) => {
  const [selectedRecId, setSelectedRecId] = useState(recordings[0]?.id || '');
  const [scope, setScope] = useState<'complete' | 'rewind'>('rewind');
  const [multiplayerMode, setMultiplayerMode] = useState(true);
  const [speechLang, setSpeechLang] = useState(defaultSpeechLang);
  const [translateLang, setTranslateLang] = useState(defaultTranslateLang);
  const [showTipsConfirm, setShowTipsConfirm] = useState(false);

  if (!open) return null;

  const targetId = selectedRecId || recordings[0]?.id || '';

  return (
    <div className="eink-modal-backdrop" role="dialog" aria-modal="true" data-testid="retranscribe-modal">
      <div className="eink-modal-card">
        <div className="eink-modal-head">
          <h3>⟲ Transcribe recording settings (다시 전사)</h3>
          <button type="button" className="btn-ghost-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {recordings.length === 0 ? (
          <p className="meta-text">다시 전사할 녹음 트랙이 현재 노트에 없습니다.</p>
        ) : (
          <div className="retrans-form">
            <label>
              대상 녹음 트랙
              <select value={targetId} onChange={(e) => setSelectedRecId(e.target.value)}>
                {recordings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.segments.length}구간)
                  </option>
                ))}
              </select>
            </label>

            <div className="retrans-scope-group">
              <span className="field-label">전사 범위</span>
              <div className="retrans-radio-row">
                <button
                  type="button"
                  className={`lang-chip ${scope === 'complete' ? 'is-selected' : ''}`}
                  onClick={() => setScope('complete')}
                >
                  Complete the transcription (미전사 구간 보완)
                </button>
                <button
                  type="button"
                  data-testid="scope-all-rewind"
                  className={`lang-chip ${scope === 'rewind' ? 'is-selected' : ''}`}
                  onClick={() => setScope('rewind')}
                >
                  All rewind (전체 처음부터 재전사)
                </button>
              </div>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={multiplayerMode}
                onChange={(e) => setMultiplayerMode(e.target.checked)}
              />
              <span>Multiplayer mode (다자간 화자 자동 분리)</span>
            </label>

            <div className="form-grid-2">
              <label>
                전사 언어
                <select value={speechLang} onChange={(e) => setSpeechLang(e.target.value)}>
                  {SUPPORTED_SPEECH_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                동시 번역 언어
                <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}>
                  {TRANSLATION_TARGETS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        <div className="eink-modal-foot">
          <button type="button" className="btn-outline" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn-ink"
            data-testid="retranscribe-update-btn"
            disabled={!targetId}
            onClick={() => setShowTipsConfirm(true)}
          >
            Transcribe immediately · Update
          </button>
        </div>

        {/* Authentic AINOTE 2 "Tips" Overwrite Confirmation Dialog */}
        {showTipsConfirm && (
          <div className="eink-submodal-overlay" data-testid="retranscribe-tips-dialog">
            <div className="eink-modal-card tips-card">
              <h4>Tips</h4>
              <p>
                {scope === 'rewind'
                  ? '선택한 언어로 녹음 전체를 처음부터 다시 전사합니다. 기존 전사 내용이 새 결과로 덮어써집니다. 계속하시겠습니까?'
                  : '미완료 구간을 선택한 언어와 화자 설정으로 전사합니다. 계속하시겠습니까?'}
              </p>
              <div className="eink-modal-foot">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowTipsConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-ink"
                  data-testid="tips-confirm-btn"
                  onClick={() => {
                    setShowTipsConfirm(false);
                    onRunRetranscribe({
                      recordingId: targetId,
                      scope,
                      multiplayerMode,
                      speechLang,
                      translateLang,
                    });
                    onClose();
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
