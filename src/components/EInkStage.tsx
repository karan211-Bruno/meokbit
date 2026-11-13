import React, { useCallback, useRef, useState } from 'react';

interface EInkStageProps {
  readingLight: number;
  quickMemoText: string;
  onQuickMemoChange: (value: string) => void;
  onSaveQuickMemoAsTodo: () => void;
  onQuickAiSubmit: (question: string) => void;
  onFullRefresh?: () => void;
  children: React.ReactNode;
}

export const EInkStage: React.FC<EInkStageProps> = ({
  readingLight,
  quickMemoText,
  onQuickMemoChange,
  onSaveQuickMemoAsTodo,
  onQuickAiSubmit,
  onFullRefresh,
  children,
}) => {
  const [flashing, setFlashing] = useState(false);
  const [quickMemoOpen, setQuickMemoOpen] = useState(false);
  const [quickBarOpen, setQuickBarOpen] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const lastTwoFingerTapRef = useRef<number>(0);

  const triggerGhostRefresh = useCallback(() => {
    setFlashing(true);
    onFullRefresh?.();
    window.setTimeout(() => setFlashing(false), 260);
  }, [onFullRefresh]);

  const handleTouchStartCapture = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const now = Date.now();
      if (now - lastTwoFingerTapRef.current < 380) {
        triggerGhostRefresh();
        lastTwoFingerTapRef.current = 0;
      } else {
        lastTwoFingerTapRef.current = now;
      }
    }
  };

  const warmthOpacity = Math.max(0, Math.min(0.32, (readingLight / 100) * 0.28));

  return (
    <div
      className={`eink-stage ${flashing ? 'is-refreshing' : ''}`}
      onTouchStartCapture={handleTouchStartCapture}
    >
      {/* Subtle 300PPI E-Ink paper micro-grain & warm frontlight */}
      <div
        className="eink-frontlight-overlay"
        style={{ opacity: warmthOpacity }}
        aria-hidden="true"
      />
      <div className="eink-ghost-flash" aria-hidden="true" />

      <div className="eink-stage-inner">{children}</div>

      {/* Right-edge Quick Memo handle (AINOTE 2 swipe-from-edge memo) */}
      <button
        type="button"
        className="edge-memo-handle"
        onClick={() => setQuickMemoOpen((prev) => !prev)}
        title="우측 엣지 퀵 메모 열기"
        aria-label="우측 엣지 퀵 메모"
      >
        퀵메모
      </button>

      {quickMemoOpen && (
        <aside className="quick-memo-drawer" aria-label="우측 빠른 메모 서랍">
          <div className="quick-drawer-header">
            <strong>빠른 메모 (Quick Memo)</strong>
            <button
              type="button"
              className="btn-ghost-sm"
              onClick={() => setQuickMemoOpen(false)}
            >
              닫기
            </button>
          </div>
          <p className="quick-drawer-hint">
            작업 중 언제든 오른쪽에서 꺼내 적고 할 일(To-Do)로 보낼 수 있습니다.
          </p>
          <textarea
            className="quick-memo-textarea"
            value={quickMemoText}
            onChange={(e) => onQuickMemoChange(e.target.value)}
            placeholder="번뜩이는 아이디어, 페이지 메모, 할 일을 바로 입력하세요..."
          />
          <div className="quick-drawer-actions">
            <button
              type="button"
              className="btn-ink"
              onClick={() => {
                onSaveQuickMemoAsTodo();
                setQuickMemoOpen(false);
              }}
              disabled={!quickMemoText.trim()}
            >
              할 일(To-Do)로 추가
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                onQuickAiSubmit(quickMemoText);
                setQuickMemoOpen(false);
              }}
              disabled={!quickMemoText.trim()}
            >
              AI 질문
            </button>
          </div>
        </aside>
      )}

      {/* Bottom Quickbar AI handle */}
      <div className="bottom-quickbar-anchor">
        {quickBarOpen && (
          <form
            className="bottom-quickbar-pop"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quickInput.trim()) return;
              onQuickAiSubmit(quickInput.trim());
              setQuickInput('');
              setQuickBarOpen(false);
            }}
          >
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="무엇이든 AI에게 바로 물어보세요..."
              autoFocus
            />
            <button type="submit" className="btn-ink">
              질문
            </button>
          </form>
        )}
        <div className="bottom-quickbar-pills">
          <button
            type="button"
            className="quickbar-pill"
            onClick={() => setQuickBarOpen((v) => !v)}
            title="하단 퀵바 AI"
          >
            하단 AI 퀵바
          </button>
          <button
            type="button"
            className="quickbar-pill"
            onClick={triggerGhostRefresh}
            title="E-Ink 잔상 전체 새로고침 (두 손가락 두 번 탭)"
          >
            잔상 새로고침
          </button>
        </div>
      </div>
    </div>
  );
};
