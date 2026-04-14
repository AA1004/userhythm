import React, { useEffect, useRef } from 'react';
import { Note } from '../types/game';
import { LANE_POSITIONS } from '../constants/gameConstants';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';

const HOLD_MIN_HEIGHT = 60;
const HOLD_HEAD_HEIGHT = 32;
const NOTE_SPAWN_Y = -100;
const NOTE_RENDER_BUFFER = 180;
const NOTE_SPRITE_CACHE_LIMIT = 24;

type NoteSpriteType = 'tap' | 'holdHead';

const noteSpriteCache = new Map<string, HTMLCanvasElement>();

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

  // Rendering-only rule: while holding, the head is visually anchored to the judgment line.
  const headY =
    isHolding && currentTime >= note.time
      ? judgeLineY
      : Math.max(NOTE_SPAWN_Y, Math.min(judgeLineY, rawHeadY));
  const tailY = Math.max(NOTE_SPAWN_Y, Math.min(judgeLineY, rawTailY));

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

      for (const note of renderNotes) {
        if (note.hit) continue;

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
          if (!position) continue;
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
          if (!segment) continue;
          const { containerTop, containerHeight, visibleTop, visibleBottom, holdHeadHeight } = segment;
          const holdProgress = note.duration
            ? Math.max(0, Math.min(1, (currentTime - note.time) / note.duration))
            : 0;

          ctx.save();
          ctx.beginPath();
          ctx.rect(left - 8, visibleTop, activeNoteWidth + 16, visibleBottom - visibleTop);
          ctx.clip();

          const bgGradient = ctx.createLinearGradient(left, containerTop, left, containerTop + containerHeight);
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
          drawRoundedRect(ctx, left, containerTop, activeNoteWidth, containerHeight, radius);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          const highlightRadius = 12;
          const highlightLeft = left + activeNoteWidth * 0.1;
          const highlightTop = containerTop + 4;
          const highlightWidth = activeNoteWidth * 0.8;
          const highlightHeight = 12;
          drawRoundedRect(ctx, highlightLeft, highlightTop, highlightWidth, highlightHeight, highlightRadius);
          ctx.fill();

          if (holdProgress > 0) {
            const progressHeight = (containerHeight - holdHeadHeight) * holdProgress;
            const progressGradient = ctx.createLinearGradient(
              left + activeNoteWidth * 0.18,
              containerTop + containerHeight - holdHeadHeight - progressHeight,
              left + activeNoteWidth * 0.18,
              containerTop + containerHeight - holdHeadHeight
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
            const progressTop = containerTop + containerHeight - holdHeadHeight - progressHeight;
            const progressWidth = activeNoteWidth * 0.64;
            drawRoundedRect(ctx, progressLeft, progressTop, progressWidth, progressHeight, progressRadius);
            ctx.fill();
          }

          const headLeft = left + 6;
          const headTop = containerTop + containerHeight - holdHeadHeight;
          const headWidth = activeNoteWidth - 12;
          ctx.drawImage(
            getNoteSprite('holdHead', headWidth, holdHeadHeight, isHolding),
            headLeft,
            headTop,
            headWidth,
            holdHeadHeight
          );

          ctx.restore();
          drawnNotes += 1;
        }
      }

      if (shouldProfile) {
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
  }, [canvasRef, currentTimeRef, visible]);

  return null;
};
