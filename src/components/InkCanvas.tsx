import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InkPoint, InkStroke, PageTimeMark, PaperTemplateId, PenKind } from '../types';
import { drawPaperTemplate } from '../lib/templates';

export interface LassoSelection {
  strokeIds: string[];
  bbox: { x: number; y: number; w: number; h: number };
  cropDataUrl: string;
}

interface InkCanvasProps {
  pageId: string;
  template: PaperTemplateId;
  backgroundImage?: string;
  textLayer: string;
  strokes: InkStroke[];
  timeMarks?: PageTimeMark[];
  showSyncMarkers?: boolean;
  clickToSpeak?: boolean;
  pen: PenKind;
  shade: string;
  baseWidth: number;
  toolMode: 'pen' | 'eraser' | 'lasso' | 'text';
  activeRecordingId?: string;
  getRecordingOffsetMs?: () => number;
  highlightAudioTimeMs?: number | null;
  undoSignal?: number;
  redoSignal?: number;
  onChangeStrokes: (strokes: InkStroke[]) => void;
  onChangeTextLayer: (text: string) => void;
  onSeekAudio?: (recordingId: string, offsetMs: number) => void;
  onLassoAction: (action: 'ai-ask' | 'to-markdown' | 'to-todo' | 'delete', selection: LassoSelection) => void;
  refreshNonce: number;
}

const CANVAS_W = 1000;
const CANVAS_H = 1400;

function pointToCanvas(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  pan: { x: number; y: number },
  zoom: number
): { x: number; y: number } {
  const localX = (clientX - rect.left - pan.x) / zoom;
  const localY = (clientY - rect.top - pan.y) / zoom;
  return {
    x: Math.max(0, Math.min(CANVAS_W, (localX / (rect.width / zoom)) * CANVAS_W)),
    y: Math.max(0, Math.min(CANVAS_H, (localY / (rect.height / zoom)) * CANVAS_H)),
  };
}

function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke, isHighlighted: boolean) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.pen === 'highlighter') {
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = stroke.shade === '#121212' ? '#6e7278' : stroke.shade;
    ctx.lineWidth = stroke.baseWidth * 4.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.strokeStyle = isHighlighted ? '#000000' : stroke.shade;
  if (stroke.pen === 'pencil') {
    ctx.globalAlpha = 0.78;
  }

  if (pts.length === 1) {
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, Math.max(1, stroke.baseWidth * (0.6 + pts[0].p)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Variable-width quadratic Bézier stroke tuned for fountain pen & calligraphy feel
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(1, curr.t - prev.t);
    const velocity = dist / dt;

    let width = stroke.baseWidth;
    if (stroke.pen === 'fountain') {
      const pressureFactor = 0.55 + curr.p * 1.15;
      const speedFactor = Math.max(0.62, 1.18 - Math.min(0.55, velocity * 0.18));
      const nibAngle = Math.abs(Math.sin(Math.atan2(dy, dx) - Math.PI / 4));
      width = stroke.baseWidth * pressureFactor * speedFactor * (0.82 + 0.36 * nibAngle);
    } else if (stroke.pen === 'brush') {
      width = stroke.baseWidth * (0.5 + curr.p * 1.8);
    } else if (stroke.pen === 'pencil') {
      width = stroke.baseWidth * (0.75 + curr.p * 0.55);
    } else {
      width = stroke.baseWidth * (0.9 + curr.p * 0.25);
    }

    if (isHighlighted) {
      width *= 1.35;
    }

    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.lineWidth = Math.max(0.8, width);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }

  ctx.restore();
}

export const InkCanvas: React.FC<InkCanvasProps> = ({
  pageId,
  template,
  backgroundImage,
  textLayer,
  strokes,
  timeMarks = [],
  showSyncMarkers = true,
  clickToSpeak = true,
  pen,
  shade,
  baseWidth,
  toolMode,
  activeRecordingId,
  getRecordingOffsetMs,
  highlightAudioTimeMs,
  undoSignal = 0,
  redoSignal = 0,
  onChangeStrokes,
  onChangeTextLayer,
  onSeekAudio,
  onLassoAction,
  refreshNonce,
}) => {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [undoStack, setUndoStack] = useState<InkStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<InkStroke[][]>([]);
  const [lassoPoly, setLassoPoly] = useState<{ x: number; y: number }[]>([]);
  const [lassoSelection, setLassoSelection] = useState<LassoSelection | null>(null);

  const activeStrokeRef = useRef<InkStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const bgImageObjRef = useRef<HTMLImageElement | null>(null);
  const pinchStateRef = useRef<{ dist: number; zoom: number } | null>(null);

  // Reset transient stacks when changing pages
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setLassoSelection(null);
    setLassoPoly([]);
  }, [pageId]);

  // Load optional PDF/image background
  useEffect(() => {
    if (!backgroundImage) {
      bgImageObjRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      bgImageObjRef.current = img;
      drawBackgroundLayer();
    };
    img.src = backgroundImage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImage]);

  const drawBackgroundLayer = useCallback(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawPaperTemplate(ctx, template, CANVAS_W, CANVAS_H);
    if (bgImageObjRef.current) {
      const img = bgImageObjRef.current;
      const ratio = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      ctx.drawImage(img, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh);
    }
  }, [template]);

  const drawInkLayer = useCallback(
    (extraStroke?: InkStroke | null) => {
      const canvas = inkCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      for (const stroke of strokes) {
        const isSyncedNow =
          highlightAudioTimeMs !== null &&
          highlightAudioTimeMs !== undefined &&
          stroke.audioOffsetMs !== undefined &&
          Math.abs(stroke.audioOffsetMs - highlightAudioTimeMs) < 1800;
        renderStroke(ctx, stroke, Boolean(isSyncedNow));

        // Draw subtle dashed audio-sync marker beneath synced handwriting strokes
        if (showSyncMarkers && stroke.audioOffsetMs !== undefined && stroke.points.length >= 2) {
          let minX = CANVAS_W;
          let maxX = 0;
          let maxY = 0;
          for (const p of stroke.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
          ctx.save();
          ctx.strokeStyle = isSyncedNow ? '#111111' : '#7b848c';
          ctx.lineWidth = isSyncedNow ? 2.4 : 1.4;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(minX, Math.min(CANVAS_H - 6, maxY + 8));
          ctx.lineTo(Math.max(minX + 18, maxX), Math.min(CANVAS_H - 6, maxY + 8));
          ctx.stroke();
          ctx.restore();
        }
      }

      if (extraStroke) {
        renderStroke(ctx, extraStroke, false);
      }

      if (lassoPoly.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(lassoPoly[0].x, lassoPoly[0].y);
        for (let i = 1; i < lassoPoly.length; i++) {
          ctx.lineTo(lassoPoly[i].x, lassoPoly[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      if (lassoSelection) {
        ctx.save();
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          lassoSelection.bbox.x,
          lassoSelection.bbox.y,
          lassoSelection.bbox.w,
          lassoSelection.bbox.h
        );
        ctx.restore();
      }
    },
    [strokes, lassoPoly, lassoSelection, highlightAudioTimeMs, showSyncMarkers]
  );

  const prevUndoSigRef = useRef(undoSignal);
  const prevRedoSigRef = useRef(redoSignal);
  useEffect(() => {
    if (undoSignal !== prevUndoSigRef.current) {
      prevUndoSigRef.current = undoSignal;
      handleUndo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoSignal]);
  useEffect(() => {
    if (redoSignal !== prevRedoSigRef.current) {
      prevRedoSigRef.current = redoSignal;
      handleRedo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redoSignal]);

  useEffect(() => {
    drawBackgroundLayer();
  }, [drawBackgroundLayer, refreshNonce]);

  useEffect(() => {
    drawInkLayer();
  }, [drawInkLayer, refreshNonce]);

  const commitStrokes = (nextStrokes: InkStroke[]) => {
    setUndoStack((prev) => [...prev.slice(-59), strokes]);
    setRedoStack([]);
    onChangeStrokes(nextStrokes);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, strokes]);
    onChangeStrokes(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [...s.slice(-59), strokes]);
    onChangeStrokes(next);
  };

  const eraseAtPoint = (pt: { x: number; y: number }) => {
    const threshold = Math.max(18, baseWidth * 4);
    const filtered = strokes.filter(
      (s) => !s.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= threshold)
    );
    if (filtered.length !== strokes.length) {
      commitStrokes(filtered);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (toolMode === 'text') return;
    // Palm rejection: ignore wide touch contacts when pen is expected, allow single touch/mouse/pen
    if (e.pointerType === 'touch' && e.width > 38) return;

    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pt = pointToCanvas(e.clientX, e.clientY, rect, { x: 0, y: 0 }, 1);

    // Check if tapping a stroke synced to audio (Click-to-Speak or Alt+Click)
    const tapHitStroke =
      (e.altKey || (clickToSpeak && !activeRecordingId && toolMode === 'pen')) && onSeekAudio
        ? strokes.find(
            (s) =>
              s.audioRecordingId &&
              s.audioOffsetMs !== undefined &&
              s.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 18)
          )
        : undefined;
    if (tapHitStroke && tapHitStroke.audioRecordingId && tapHitStroke.audioOffsetMs !== undefined && onSeekAudio) {
      onSeekAudio(tapHitStroke.audioRecordingId, tapHitStroke.audioOffsetMs);
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    setLassoSelection(null);

    const isStylusEraser = e.pointerType === 'pen' && e.buttons === 32;
    if (toolMode === 'eraser' || isStylusEraser) {
      eraseAtPoint(pt);
      return;
    }

    if (toolMode === 'lasso') {
      setLassoPoly([pt]);
      return;
    }

    const initialPoint: InkPoint = {
      x: pt.x,
      y: pt.y,
      p: e.pointerType === 'pen' ? Math.max(0.1, e.pressure || 0.5) : 0.52,
      t: Date.now(),
    };

    activeStrokeRef.current = {
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pen,
      shade,
      baseWidth,
      points: [initialPoint],
      audioRecordingId: activeRecordingId,
      audioOffsetMs: activeRecordingId && getRecordingOffsetMs ? getRecordingOffsetMs() : undefined,
    };
    drawInkLayer(activeStrokeRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const isStylusEraser = e.pointerType === 'pen' && e.buttons === 32;
    if (toolMode === 'eraser' || isStylusEraser) {
      const pt = pointToCanvas(e.clientX, e.clientY, rect, { x: 0, y: 0 }, 1);
      eraseAtPoint(pt);
      return;
    }

    if (toolMode === 'lasso') {
      const pt = pointToCanvas(e.clientX, e.clientY, rect, { x: 0, y: 0 }, 1);
      setLassoPoly((prev) => [...prev, pt]);
      return;
    }

    const stroke = activeStrokeRef.current;
    if (!stroke) return;

    const nativeEvent = e.nativeEvent as PointerEvent;
    const events =
      typeof nativeEvent.getCoalescedEvents === 'function'
        ? nativeEvent.getCoalescedEvents()
        : [nativeEvent];

    const list = events.length > 0 ? events : [nativeEvent];
    for (const ce of list) {
      const pt = pointToCanvas(ce.clientX, ce.clientY, rect, { x: 0, y: 0 }, 1);
      stroke.points.push({
        x: pt.x,
        y: pt.y,
        p: ce.pointerType === 'pen' ? Math.max(0.1, ce.pressure || 0.5) : 0.52,
        t: Date.now(),
      });
    }
    drawInkLayer(stroke);
  };

  const finalizeLasso = (poly: { x: number; y: number }[]) => {
    if (poly.length < 3) {
      setLassoPoly([]);
      return;
    }
    const selected = strokes.filter((s) =>
      s.points.some((p) => pointInPolygon(p.x, p.y, poly))
    );
    if (selected.length === 0) {
      setLassoPoly([]);
      return;
    }

    let minX = CANVAS_W;
    let minY = CANVAS_H;
    let maxX = 0;
    let maxY = 0;
    for (const s of selected) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const pad = 18;
    const bx = Math.max(0, minX - pad);
    const by = Math.max(0, minY - pad);
    const bw = Math.min(CANVAS_W - bx, maxX - minX + pad * 2);
    const bh = Math.min(CANVAS_H - by, maxY - minY + pad * 2);

    // Export cropped white-background snapshot for AI vision / OCR
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(80, Math.round(bw));
    offscreen.height = Math.max(80, Math.round(bh));
    const octx = offscreen.getContext('2d');
    let cropDataUrl = '';
    if (octx) {
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, offscreen.width, offscreen.height);
      octx.translate(-bx, -by);
      for (const s of selected) {
        renderStroke(octx, s, false);
      }
      cropDataUrl = offscreen.toDataURL('image/png');
    }

    setLassoPoly([]);
    setLassoSelection({
      strokeIds: selected.map((s) => s.id),
      bbox: { x: bx, y: by, w: bw, h: bh },
      cropDataUrl,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    if (toolMode === 'lasso') {
      finalizeLasso(lassoPoly);
      return;
    }
    if (activeStrokeRef.current) {
      const done = activeStrokeRef.current;
      activeStrokeRef.current = null;
      commitStrokes([...strokes, done]);
    }
  };

  const handleTouchMoveZoom = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (!pinchStateRef.current) {
        pinchStateRef.current = { dist, zoom };
      } else {
        const nextZoom = Math.max(
          0.7,
          Math.min(2.4, pinchStateRef.current.zoom * (dist / pinchStateRef.current.dist))
        );
        setZoom(Number(nextZoom.toFixed(2)));
      }
    }
  };

  const handleTouchEndZoom = () => {
    pinchStateRef.current = null;
  };

  const syncedStrokeCount = useMemo(
    () => strokes.filter((s) => s.audioOffsetMs !== undefined).length,
    [strokes]
  );

  return (
    <div className="ink-canvas-wrapper">
      <div className="ink-canvas-status">
        <div className="ink-status-left">
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
          >
            실행 취소
          </button>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
          >
            다시 실행
          </button>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            배율 {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(2))))}
          >
            +확대
          </button>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.2).toFixed(2))))}
          >
            -축소
          </button>
        </div>
        <div className="ink-status-right">
          <span>획 {strokes.length}개</span>
          {syncedStrokeCount > 0 && (
            <span title="Alt/Option+클릭 시 녹음 시점으로 이동">
              음성연동 {syncedStrokeCount}획
            </span>
          )}
        </div>
      </div>

      <div
        ref={stageRef}
        className="ink-sheet-viewport"
        onTouchMove={handleTouchMoveZoom}
        onTouchEnd={handleTouchEndZoom}
      >
        <div
          className="ink-sheet-surface"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'top center',
          }}
        >
          <canvas
            ref={bgCanvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="ink-layer-canvas ink-bg-canvas"
          />
          <canvas
            ref={inkCanvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className={`ink-layer-canvas ink-draw-canvas mode-${toolMode}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <textarea
            className={`ink-text-layer ${toolMode === 'text' ? 'is-editable' : ''}`}
            value={textLayer}
            onChange={(e) => onChangeTextLayer(e.target.value)}
            placeholder={
              toolMode === 'text'
                ? '이곳에 텍스트, 회의록, 마크다운 메모를 입력하세요...'
                : ''
            }
            readOnly={toolMode !== 'text'}
          />
          {showSyncMarkers &&
            timeMarks.map((tm) => (
              <button
                key={tm.id}
                type="button"
                data-testid={`time-mark-${tm.id}`}
                className={`canvas-time-mark ${
                  highlightAudioTimeMs !== null &&
                  highlightAudioTimeMs !== undefined &&
                  Math.abs(tm.offsetMs - highlightAudioTimeMs) < 1800
                    ? 'is-playing'
                    : ''
                }`}
                style={{
                  left: `${(tm.x / CANVAS_W) * 100}%`,
                  top: `${(tm.y / CANVAS_H) * 100}%`,
                }}
                title={`Click-to-Speak: ${tm.label} 부터 재생`}
                onClick={() => onSeekAudio?.(tm.recordingId, tm.offsetMs)}
              >
                ▶ {tm.label}
              </button>
            ))}
        </div>
      </div>

      {lassoSelection && (
        <div className="lasso-action-bar" role="toolbar" aria-label="올가미 선택 작업">
          <span>{lassoSelection.strokeIds.length}개 필기 선택됨</span>
          <button
            type="button"
            className="btn-ink-sm"
            onClick={() => {
              onLassoAction('ai-ask', lassoSelection);
              setLassoSelection(null);
            }}
          >
            AI 검색/질문
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => {
              onLassoAction('to-markdown', lassoSelection);
              setLassoSelection(null);
            }}
          >
            텍스트/마크다운 변환
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => {
              onLassoAction('to-todo', lassoSelection);
              setLassoSelection(null);
            }}
          >
            할 일/일정 등록
          </button>
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => {
              onLassoAction('delete', lassoSelection);
              setLassoSelection(null);
            }}
          >
            선택 삭제
          </button>
        </div>
      )}
    </div>
  );
};
