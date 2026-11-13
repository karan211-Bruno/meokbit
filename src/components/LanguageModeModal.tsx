import React, { useState } from 'react';
import type { AiSettings, TranslationPair } from '../types';
import { SUPPORTED_SPEECH_LANGUAGES, TRANSLATION_TARGETS } from '../lib/voiceRecorder';

interface LanguageModeModalProps {
  open: boolean;
  onClose: () => void;
  settings: AiSettings;
  onUpdateSettings: (next: AiSettings) => void;
}

const OFFLINE_CODES = new Set(['ko-KR', 'en-US', 'ja-JP', 'zh-CN']);

export const LanguageModeModal: React.FC<LanguageModeModalProps> = ({
  open,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [srcLang, setSrcLang] = useState(settings.speechLang);
  const [tgtLang, setTgtLang] = useState(settings.translateLang);

  if (!open) return null;

  const handleAddPair = () => {
    const src = SUPPORTED_SPEECH_LANGUAGES.find((l) => l.code === srcLang);
    const tgt = TRANSLATION_TARGETS.find((l) => l.code === tgtLang);
    if (!src || !tgt) return;

    const id = `pair-${src.code}-${tgt.code}`;
    if (settings.savedTranslationPairs.some((p) => p.id === id)) {
      onUpdateSettings({
        ...settings,
        speechLang: src.code,
        translateLang: tgt.code,
      });
      return;
    }

    const nextPair: TranslationPair = {
      id,
      sourceCode: src.code,
      sourceLabel: src.label,
      targetCode: tgt.code,
      targetLabel: tgt.label.split(' ')[0],
    };

    onUpdateSettings({
      ...settings,
      speechLang: src.code,
      translateLang: tgt.code,
      savedTranslationPairs: [nextPair, ...settings.savedTranslationPairs],
    });
  };

  return (
    <div className="eink-modal-backdrop" role="dialog" aria-modal="true" data-testid="language-mode-modal">
      <div className="eink-modal-card lang-modal-card">
        <div className="eink-modal-head">
          <div>
            <h3>전사 언어(16개어) · 상호 번역 모드</h3>
            <p className="meta-text">선택한 언어 및 번역 쌍은 앱 재실행 후에도 자동 복원됩니다.</p>
          </div>
          <button type="button" className="btn-ghost-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        <section className="lang-section">
          <h4>음성 인식 · 전사 언어 (16 Languages)</h4>
          <div className="lang-grid-16">
            {SUPPORTED_SPEECH_LANGUAGES.map((lang) => {
              const selected = settings.speechLang === lang.code;
              const offlineReady = OFFLINE_CODES.has(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  data-testid={`speech-lang-${lang.code}`}
                  className={`lang-chip ${selected ? 'is-selected' : ''}`}
                  onClick={() => onUpdateSettings({ ...settings, speechLang: lang.code })}
                >
                  <span>{lang.label}</span>
                  {offlineReady && <span className="offline-pill">Offline</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="lang-section">
          <div className="lang-pair-header">
            <h4>저장된 상호 번역 모드 (Mutual Translation · 10개어)</h4>
          </div>

          <div className="saved-pairs-list">
            {settings.savedTranslationPairs.map((pair) => {
              const active =
                settings.speechLang === pair.sourceCode && settings.translateLang === pair.targetCode;
              return (
                <div key={pair.id} className={`saved-pair-chip ${active ? 'is-selected' : ''}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        speechLang: pair.sourceCode,
                        translateLang: pair.targetCode,
                      })
                    }
                  >
                    {pair.sourceLabel} ↔ {pair.targetLabel}
                  </button>
                  {settings.savedTranslationPairs.length > 1 && (
                    <button
                      type="button"
                      className="btn-ghost-sm"
                      aria-label="번역 쌍 삭제"
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          savedTranslationPairs: settings.savedTranslationPairs.filter(
                            (p) => p.id !== pair.id,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="add-mode-row">
            <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)} aria-label="원본 언어">
              {SUPPORTED_SPEECH_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <span>→</span>
            <select value={tgtLang} onChange={(e) => setTgtLang(e.target.value)} aria-label="번역 대상 언어">
              {TRANSLATION_TARGETS.slice(0, 10).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ink-sm"
              data-testid="add-translation-mode"
              onClick={handleAddPair}
            >
              + Add Mode
            </button>
          </div>
        </section>

        <div className="eink-modal-foot">
          <button type="button" className="btn-ink" onClick={onClose}>
            확인 (적용)
          </button>
        </div>
      </div>
    </div>
  );
};
