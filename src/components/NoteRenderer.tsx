import React, { useEffect, useRef } from 'react';
import { Note } from '../types/game';
import { LANE_POSITIONS, NOTE_VISIBILITY_BUFFER_MS } from '../constants/gameConstants';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { HitNoteIdsRef, isNoteResolved } from '../utils/noteRuntimeState';

const HOLD_MIN_HEIGHT = 60;
const HOLD_HEAD_HEIGHT = 32;
const NOTE_SPAWN_Y = -100;
const NOTE_RENDER_BUFFER = 180;
const NOTE_SPRITE_CACHE_LIMIT = 24;

type NoteSpriteType = 'tap' | 'holdHead';

const noteSpriteCache = new Map<string, HTMLCanvasElement>();

function binarySearchEndIndex(notes: Note[], targetTime: number, startIdx: number): number {
  let low = startIdx;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time <= targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low - 1;
}

function binarySearchStartIndex(notes: Note[], targetTime: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

const getNoteRenderEndTime = (note: Note) =>
  note.type === 'hold' && note.duration > 0 ? note.endTime || note.time + note.duration : note.time;

function binarySearchHoldEndIndex(notes: Note[], holdIndicesByEnd: number[], targetTime: number): number {
  let low = 0;
  let high = holdIndicesByEnd.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (getNoteRenderEndTime(notes[holdIndicesByEnd[mid]]) < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

const getNotesRenderIndexSignature = (notes: Note[]) => {
  const first = notes[0];
  const last = notes[notes.length - 1];
  return [
    notes.length,
    first?.id ?? 'none',
    first?.time ?? 0,
    first ? getNoteRenderEndTime(first) : 0,
    last?.id ?? 'none',
    last?.time ?? 0,
    last ? getNoteRenderEndTime(last) : 0,
  ].join(':');
};

interface NoteRenderIndex {
  signature: string;
  holdIndicesByEnd: number[];
  startIndex: number;
  lastViewportStart: number;
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(left + safeRadius, top);
  ctx.lineTo(left + width - safeRadius, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + safeRadius);
  ctx.lineTo(left + width, top + height - safeRadius);
  ctx.quadraticCurveTo(left + width, top + height, left + width - safeRadius, top + height);
  ctx.lineTo(left + safeRadius, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - safeRadius);
  ctx.lineTo(left, top + safeRadius);
  ctx.quadraticCurveTo(left, top, left + safeRadius, top);
  ctx.closePath();
};

const getNoteSprite = (
  type: NoteSpriteType,
  noteWidth: number,
  noteHeight: number,
  isHolding: boolean,
  themeVariant: 'default' = 'default'
) => {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(noteWidth);
  const height = Math.round(noteHeight);
  const cacheKey = `${type}:${width}:${height}:${isHolding ? 'holding' : 'idle'}:${themeVariant}:${dpr}`;
  const cached = noteSpriteCache.get(cacheKey);
  if (cached) return cached;

  const sprite = document.createElement('canvas');
  sprite.width = Math.max(1, Math.round(width * dpr));
  sprite.height = Math.max(1, Math.round(height * dpr));
  const spriteCtx = sprite.getContext('2d');
  if (!spriteCtx) return sprite;

  spriteCtx.scale(dpr, dpr);

  if (type === 'tap') {
    const gradient = spriteCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#FF6B6B');
    gradient.addColorStop(1, '#FF9A8B');
    spriteCtx.fillStyle = gradient;
    spriteCtx.strokeStyle = '#EE5A52';
    spriteCtx.lineWidth = 3;
    drawRoundedRect(spriteCtx, 1.5, 1.5, width - 3, height - 3, 14);
    spriteCtx.fill();
    spriteCtx.stroke();
  } else {
    const gradient = spriteCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, isHolding ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, isHolding ? 'rgba(255,244,196,0.82)' : 'rgba(255,255,255,0.68)');
    spriteCtx.fillStyle = gradient;
    drawRoundedRect(spriteCtx, 0, 0, width, height, 10);
    spriteCtx.fill();
  }

  if (noteSpriteCache.size >= NOTE_SPRITE_CACHE_LIMIT) {
    const firstKey = noteSpriteCache.keys().next().value;
    if (firstKey) noteSpriteCache.delete(firstKey);
  }
  noteSpriteCache.set(cacheKey, sprite);
  return sprite;
};

interface TapRenderPosition {
  left: number;
  top: number;
}

interface HoldRenderSegment {
  containerTop: number;
  containerHeight: number;
  visibleTop: number;
  visibleBottom: number;
  holdHeadHeight: number;
}

const getEventY = (
  eventTime: number,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number
) => {
  const progress = 1 - (eventTime - currentTime) / fallDuration;
  return NOTE_SPAWN_Y + progress * (judgeLineY - NOTE_SPAWN_Y);
};

const computeTapRenderPosition = (
  note: Note,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number,
  laneX: number,
  noteWidth: number,
  noteHeight: number
): TapRenderPosition | null => {
  const y = Math.max(NOTE_SPAWN_Y, Math.min(judgeLineY, getEventY(note.time, currentTime, fallDuration, judgeLineY)));
  const top = y - noteHeight / 2;
  if (top > judgeLineY + NOTE_RENDER_BUFFER || top + noteHeight < -NOTE_RENDER_BUFFER) return null;

  return {
    left: laneX - noteWidth / 2,
    top,
  };
};

const computeHoldRenderSegment = (
  note: Note,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number,
  noteHeight: number,
  isHolding: boolean,
  viewportHeight: number
): HoldRenderSegment | null => {
  const endTime = note.endTime ?? note.time + note.duration;
  const rawHeadY = getEventY(note.time, currentTime, fallDuration, judgeLineY);
  const rawTailY = getEventY(endTime, currentTime, fallDuration, judgeLineY);
  const visualHalfHeight = noteHeight / 2;
  const visualBottomLimitY = judgeLineY + visualHalfHeight;
  const visualTopLimitY = NOTE_SPAWN_Y - visualHalfHeight;

  // Rendering-only rule: hold endpoints are centered on the judgment line like tap notes.
  // Judgment timing still uses note.time/endTime; only the visible capsule extends by half a note.
  const headY =
    isHolding && currentTime >= note.time
      ? visualBottomLimitY
      : Math.max(visualTopLimitY, Math.min(visualBottomLimitY, rawHeadY + visualHalfHeight));
  const tailY = Math.max(visualTopLimitY, Math.min(visualBottomLimitY, rawTailY - visualHalfHeight));

  const topY = Math.min(headY, tailY);
  const bottomY = Math.max(headY, tailY);
  const holdHeadHeight = Math.min(HOLD_HEAD_HEIGHT, Math.max(24, noteHeight));
  const fullHeight = Math.max(HOLD_MIN_HEIGHT, bottomY - topY);
  const containerTop = bottomY - fullHeight;
  const containerBottom = containerTop + fullHeight;
  const visibleTop = Math.max(containerTop, -NOTE_RENDER_BUFFER);
  const visibleBottom = Math.min(containerBottom, viewportHeight + NOTE_RENDER_BUFFER);

  if (visibleBottom <= visibleTop) return null;

  return {
    containerTop,
    containerHeight: fullHeight,
    visibleTop,
    visibleBottom,
    holdHeadHeight,
  };
};

interface NoteRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  notes: Note[];
  currentTimeRef: React.MutableRefObject<number>;
  fallDuration: number;
  judgeLineY: number;
  laneCenters?: readonly number[];
  noteWidth?: number;
  noteHeight?: number;
  holdingNotes: Map<number, Note>;
  hitNoteIdsRef: HitNoteIdsRef;
  visible: boolean;
}

/**
 * Canvas based note renderer.
 * Runs in its own rAF loop to keep animation smooth on high refresh-rate displays.
 */
export const NoteRenderer: React.FC<NoteRendererProps> = ({
  canvasRef,
  notes,
  currentTimeRef,
  fallDuration,
  judgeLineY,
  laneCenters = LANE_POSITIONS,
  noteWidth = 90,
  noteHeight = 42,
  holdingNotes,
  hitNoteIdsRef,
  visible,
}) => {
  const rafIdRef = useRef<number>();
  const notesRef = useRef(notes);
  const holdingNotesRef = useRef(holdingNotes);
  const fallDurationRef = useRef(fallDuration);
  const judgeLineYRef = useRef(judgeLineY);
  const laneCentersRef = useRef(laneCenters);
  const noteWidthRef = useRef(noteWidth);
  const noteHeightRef = useRef(noteHeight);
  const visibleRef = useRef(visible);
  const renderIndexRef = useRef<NoteRenderIndex>({
    signature: '',
    holdIndicesByEnd: [],
    startIndex: 0,
    lastViewportStart: Number.NEGATIVE_INFINITY,
  });

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    holdingNotesRef.current = holdingNotes;
  }, [holdingNotes]);

  useEffect(() => {
    fallDurationRef.current = fallDuration;
  }, [fallDuration]);

  useEffect(() => {
    judgeLineYRef.current = judgeLineY;
  }, [judgeLineY]);

  useEffect(() => {
    laneCentersRef.current = laneCenters;
  }, [laneCenters]);

  useEffect(() => {
    noteWidthRef.current = noteWidth;
    noteHeightRef.current = noteHeight;
  }, [noteWidth, noteHeight]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    noteSpriteCache.clear();
  }, [noteWidth, noteHeight]);

  useEffect(() => {
    if (!visible || !canvasRef.current) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = undefined;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setupCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;

      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    setupCanvas();

    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;

    const render = () => {
      if (!visibleRef.current || !canvasRef.current) return;

      const shouldProfile = isGameplayProfilerEnabled();
      const profileStart = shouldProfile ? performance.now() : 0;
      let drawnNotes = 0;
      const currentTime = currentTimeRef.current;
      const renderNotes = notesRef.current;
      const activeHoldingNotes = holdingNotesRef.current;
      const activeFallDuration = fallDurationRef.current;
      const activeJudgeLineY = judgeLineYRef.current;
      const activeLaneCenters = laneCentersRef.current;
      const activeNoteWidth = noteWidthRef.current;
      const activeNoteHeight = noteHeightRef.current;
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);

      const filterProfileStart = shouldProfile ? performance.now() : 0;
      let inspectedNotes = 0;

      const renderIndexSignature = getNotesRenderIndexSignature(renderNotes);
      if (renderIndexRef.current.signature !== renderIndexSignature) {
        renderIndexRef.current = {
          signature: renderIndexSignature,
          holdIndicesByEnd: renderNotes
            .map((note, index) => (note.type === 'hold' && note.duration > 0 ? index : -1))
            .filter((index) => index >= 0)
            .sort((a, b) => getNoteRenderEndTime(renderNotes[a]) - getNoteRenderEndTime(renderNotes[b])),
          startIndex: 0,
          lastViewportStart: Number.NEGATIVE_INFINITY,
        };
      }

      const viewportStart = currentTime - activeFallDuration - NOTE_VISIBILITY_BUFFER_MS;
      const viewportEnd = currentTime + activeFallDuration + NOTE_VISIBILITY_BUFFER_MS;
      const binaryStartIdx = binarySearchStartIndex(renderNotes, viewportStart);
      const canAdvanceCursor = viewportStart >= renderIndexRef.current.lastViewportStart;
      const startIdx = canAdvanceCursor
        ? Math.max(renderIndexRef.current.startIndex, binaryStartIdx)
        : binaryStartIdx;
      renderIndexRef.current.startIndex = startIdx;
      renderIndexRef.current.lastViewportStart = viewportStart;
      const endIdx = binarySearchEndIndex(renderNotes, viewportEnd, startIdx);

      if (shouldProfile) {
        recordGameplayMetric('visibleCursor', 0, startIdx);
      }

      const drawNote = (note: Note) => {
        if (isNoteResolved(note, hitNoteIdsRef)) return;
        if (note.time > viewportEnd || getNoteRenderEndTime(note) < viewportStart) return;

        const isHoldNote = note.duration > 0 && note.type === 'hold';
        const laneX = activeLaneCenters[note.lane] ?? LANE_POSITIONS[note.lane];

        if (!isHoldNote) {
          const position = computeTapRenderPosition(
            note,
            currentTime,
            activeFallDuration,
            activeJudgeLineY,
            laneX,
            activeNoteWidth,
            activeNoteHeight
          );
          if (!position) return;
          const { left, top } = position;

          ctx.drawImage(
            getNoteSprite('tap', activeNoteWidth, activeNoteHeight, false),
            left,
            top,
            activeNoteWidth,
            activeNoteHeight
          );
          drawnNotes += 1;
        } else {
          const left = laneX - activeNoteWidth / 2;
          const isHolding = activeHoldingNotes.has(note.id);
          const segment = computeHoldRenderSegment(
            note,
            currentTime,
            activeFallDuration,
            activeJudgeLineY,
            activeNoteHeight,
            isHolding,
            logicalHeight
          );
          if (!segment) return;
          const { containerTop, containerHeight, visibleTop, visibleBottom, holdHeadHeight } = segment;
          const holdProgress = note.duration
            ? Math.max(0, Math.min(1, (currentTime - note.time) / note.duration))
            : 0;

          const bodyTop = Math.max(visibleTop, containerTop);
          const bodyBottom = Math.min(visibleBottom, containerTop + containerHeight);
          const bodyHeight = bodyBottom - bodyTop;
          if (bodyHeight <= 0) return;

          // Long notes can be far taller than the viewport. Draw only the clipped visible span
          // so a long-note spawn never builds huge paths/gradients for offscreen pixels.
          const bgGradient = ctx.createLinearGradient(left, bodyTop, left, bodyBottom);
          if (isHolding) {
            bgGradient.addColorStop(0, 'rgba(255,231,157,0.95)');
            bgGradient.addColorStop(1, 'rgba(255,193,7,0.65)');
          } else {
            bgGradient.addColorStop(0, 'rgba(78,205,196,0.9)');
            bgGradient.addColorStop(1, 'rgba(32,164,154,0.7)');
          }

          ctx.fillStyle = bgGradient;
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          const radius = 18;
          drawRoundedRect(ctx, left, bodyTop, activeNoteWidth, bodyHeight, radius);
          ctx.fill();
          ctx.stroke();

          const highlightRadius = 12;
          const highlightLeft = left + activeNoteWidth * 0.1;
          const highlightTop = containerTop + 4;
          const highlightWidth = activeNoteWidth * 0.8;
          const highlightHeight = 12;
          const highlightBottom = highlightTop + highlightHeight;
          if (highlightBottom >= visibleTop && highlightTop <= visibleBottom) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            drawRoundedRect(ctx, highlightLeft, highlightTop, highlightWidth, highlightHeight, highlightRadius);
            ctx.fill();
          }

          if (holdProgress > 0) {
            const progressHeight = (containerHeight - holdHeadHeight) * holdProgress;
            const progressTop = containerTop + containerHeight - holdHeadHeight - progressHeight;
            const progressBottom = containerTop + containerHeight - holdHeadHeight;
            const visibleProgressTop = Math.max(progressTop, visibleTop);
            const visibleProgressBottom = Math.min(progressBottom, visibleBottom);
            const visibleProgressHeight = visibleProgressBottom - visibleProgressTop;
            if (visibleProgressHeight > 0) {
              const progressGradient = ctx.createLinearGradient(
                left + activeNoteWidth * 0.18,
                visibleProgressTop,
                left + activeNoteWidth * 0.18,
                visibleProgressBottom
              );
              if (isHolding) {
                progressGradient.addColorStop(0, 'rgba(255,255,255,0.85)');
                progressGradient.addColorStop(0.7, 'rgba(255,255,255,0.4)');
              } else {
                progressGradient.addColorStop(0, 'rgba(255,255,255,0.35)');
                progressGradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
              }
              ctx.fillStyle = progressGradient;
              const progressRadius = 10;
              const progressLeft = left + activeNoteWidth * 0.18;
              const progressWidth = activeNoteWidth * 0.64;
              drawRoundedRect(
                ctx,
                progressLeft,
                visibleProgressTop,
                progressWidth,
                visibleProgressHeight,
                progressRadius
              );
              ctx.fill();
            }
          }

          const headLeft = left + 6;
          const headTop = containerTop + containerHeight - holdHeadHeight;
          const headWidth = activeNoteWidth - 12;
          if (headTop + holdHeadHeight >= visibleTop && headTop <= visibleBottom) {
            ctx.drawImage(
              getNoteSprite('holdHead', headWidth, holdHeadHeight, isHolding),
              headLeft,
              headTop,
              headWidth,
              holdHeadHeight
            );
          }
          drawnNotes += 1;
        }
      };

      for (let i = startIdx; i <= endIdx && i < renderNotes.length; i += 1) {
        inspectedNotes += 1;
        drawNote(renderNotes[i]);
      }

      const holdIndicesByEnd = renderIndexRef.current.holdIndicesByEnd;
      const holdStartIdx = binarySearchHoldEndIndex(renderNotes, holdIndicesByEnd, viewportStart);
      for (let i = holdStartIdx; i < holdIndicesByEnd.length; i += 1) {
        const note = renderNotes[holdIndicesByEnd[i]];
        if (!note || note.time >= viewportStart) continue;
        inspectedNotes += 1;
        drawNote(note);
      }

      if (shouldProfile) {
        recordGameplayMetric('visibleNoteFilter', performance.now() - filterProfileStart, inspectedNotes);
        recordGameplayMetric('noteRender', performance.now() - profileStart, drawnNotes);
      }
      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = undefined;
      }
    };
  }, [canvasRef, currentTimeRef, hitNoteIdsRef, visible]);

  return null;
};
