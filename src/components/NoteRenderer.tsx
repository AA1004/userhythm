import React, { useEffect, useRef } from 'react';
import { Note } from '../types/game';
import { LANE_POSITIONS } from '../constants/gameConstants';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { HitNoteIdsRef, isNoteResolved } from '../utils/noteRuntimeState';
import {
  computeHoldRenderSegment,
  computeTapRenderPosition,
  getNoteRenderEndTime,
  getNoteViewportEnd,
  getNoteViewportStart,
  HOLD_HEAD_HEIGHT,
} from '../utils/noteRenderGeometry';
import {
  darkenNoteColor,
  lightenNoteColor,
  noteColorKey,
  NoteColorRgb,
  noteColorToRgba,
} from '../utils/noteColors';

const NOTE_SPRITE_CACHE_LIMIT = 48;
const GAMEPLAY_CANVAS_DPR_LIMIT = 1.5;

type NoteSpriteType = 'tap' | 'holdHead' | 'holdBody' | 'holdProgress';

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
  noteColor: NoteColorRgb,
  themeVariant: 'default' = 'default'
) => {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(noteWidth);
  const height = Math.round(noteHeight);
  const cacheKey = `${type}:${width}:${height}:${isHolding ? 'holding' : 'idle'}:${themeVariant}:${noteColorKey(noteColor)}:${dpr}`;
  const cached = noteSpriteCache.get(cacheKey);
  if (cached) return cached;

  const sprite = document.createElement('canvas');
  sprite.width = Math.max(1, Math.round(width * dpr));
  sprite.height = Math.max(1, Math.round(height * dpr));
  const spriteCtx = sprite.getContext('2d');
  if (!spriteCtx) return sprite;

  spriteCtx.scale(dpr, dpr);

  const light = lightenNoteColor(noteColor, isHolding ? 0.34 : 0.18);
  const lighter = lightenNoteColor(noteColor, isHolding ? 0.52 : 0.32);
  const dark = darkenNoteColor(noteColor, isHolding ? 0.08 : 0.18);

  if (type === 'tap') {
    const gradient = spriteCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(lighter));
    gradient.addColorStop(1, noteColorToRgba(dark));
    spriteCtx.fillStyle = gradient;
    spriteCtx.strokeStyle = noteColorToRgba(darkenNoteColor(noteColor, 0.28));
    spriteCtx.lineWidth = 3;
    drawRoundedRect(spriteCtx, 1.5, 1.5, width - 3, height - 3, 14);
    spriteCtx.fill();
    spriteCtx.stroke();
  } else if (type === 'holdHead') {
    const gradient = spriteCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(lightenNoteColor(noteColor, isHolding ? 0.7 : 0.55), 0.98));
    gradient.addColorStop(1, noteColorToRgba(lighter, isHolding ? 0.9 : 0.76));
    spriteCtx.fillStyle = gradient;
    drawRoundedRect(spriteCtx, 0, 0, width, height, 10);
    spriteCtx.fill();
  } else if (type === 'holdBody') {
    const gradient = spriteCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(isHolding ? light : noteColor, isHolding ? 0.95 : 0.9));
    gradient.addColorStop(1, noteColorToRgba(isHolding ? noteColor : dark, isHolding ? 0.74 : 0.7));
    spriteCtx.fillStyle = gradient;
    spriteCtx.fillRect(0, 0, width, height);
    spriteCtx.strokeStyle = noteColorToRgba(lightenNoteColor(noteColor, 0.42), 0.25);
    spriteCtx.lineWidth = 2;
    spriteCtx.strokeRect(1, 0, Math.max(1, width - 2), height);
  } else {
    const gradient = spriteCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(light, isHolding ? 0.88 : 0.42));
    gradient.addColorStop(1, noteColorToRgba(lighter, isHolding ? 0.5 : 0.18));
    spriteCtx.fillStyle = gradient;
    spriteCtx.fillRect(0, 0, width, height);
  }

  if (noteSpriteCache.size >= NOTE_SPRITE_CACHE_LIMIT) {
    const firstKey = noteSpriteCache.keys().next().value;
    if (firstKey) noteSpriteCache.delete(firstKey);
  }
  noteSpriteCache.set(cacheKey, sprite);
  return sprite;
};

interface NoteRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  notes: Note[];
  currentTimeRef: React.MutableRefObject<number>;
  fallDuration: number;
  judgeLineY: number;
  playfieldTopOffset?: number;
  laneCenters?: readonly number[];
  noteWidth?: number;
  noteHeight?: number;
  laneNoteColors: readonly NoteColorRgb[];
  holdingNotesRef: React.MutableRefObject<Map<number, Note>>;
  hitNoteIdsRef: HitNoteIdsRef;
  visible: boolean;
  simpleHoldVisuals?: boolean;
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
  playfieldTopOffset = 0,
  laneCenters = LANE_POSITIONS,
  noteWidth = 90,
  noteHeight = 42,
  laneNoteColors,
  holdingNotesRef,
  hitNoteIdsRef,
  visible,
  simpleHoldVisuals = false,
}) => {
  const rafIdRef = useRef<number>();
  const notesRef = useRef(notes);
  const fallDurationRef = useRef(fallDuration);
  const judgeLineYRef = useRef(judgeLineY);
  const playfieldTopOffsetRef = useRef(playfieldTopOffset);
  const laneCentersRef = useRef(laneCenters);
  const noteWidthRef = useRef(noteWidth);
  const noteHeightRef = useRef(noteHeight);
  const laneNoteColorsRef = useRef(laneNoteColors);
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
    fallDurationRef.current = fallDuration;
  }, [fallDuration]);

  useEffect(() => {
    judgeLineYRef.current = judgeLineY;
  }, [judgeLineY]);

  useEffect(() => {
    playfieldTopOffsetRef.current = playfieldTopOffset;
  }, [playfieldTopOffset]);

  useEffect(() => {
    laneCentersRef.current = laneCenters;
  }, [laneCenters]);

  useEffect(() => {
    noteWidthRef.current = noteWidth;
    noteHeightRef.current = noteHeight;
  }, [noteWidth, noteHeight]);

  useEffect(() => {
    laneNoteColorsRef.current = laneNoteColors;
  }, [laneNoteColors]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    noteSpriteCache.clear();
  }, [noteWidth, noteHeight, laneNoteColors]);

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
      const dpr = Math.min(window.devicePixelRatio || 1, GAMEPLAY_CANVAS_DPR_LIMIT);
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
      const activePlayfieldTopOffset = playfieldTopOffsetRef.current;
      const activeLaneCenters = laneCentersRef.current;
      const activeLaneNoteColors = laneNoteColorsRef.current;
      const activeNoteWidth = noteWidthRef.current;
      const activeNoteHeight = noteHeightRef.current;
      const holdHeadHeight = Math.min(HOLD_HEAD_HEIGHT, Math.max(24, activeNoteHeight));
      const holdHeadWidth = Math.max(1, activeNoteWidth - 12);
      const holdProgressWidth = Math.max(1, Math.round(activeNoteWidth * 0.64));
      const highlightWidthBase = Math.max(1, Math.round(activeNoteWidth * 0.8));
      const highlightHeightBase = 12;
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

      const viewportStart = getNoteViewportStart(currentTime, activeFallDuration);
      const viewportEnd = getNoteViewportEnd(currentTime, activeFallDuration);
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
        const laneColor = activeLaneNoteColors[note.lane];

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

          const tapSprite = getNoteSprite('tap', activeNoteWidth, activeNoteHeight, false, laneColor);
          ctx.drawImage(
            tapSprite,
            left,
            top + activePlayfieldTopOffset,
            activeNoteWidth,
            activeNoteHeight
          );
          drawnNotes += 1;
        } else {
          const holdBodySpriteIdle = getNoteSprite('holdBody', activeNoteWidth, 64, false, laneColor);
          const holdBodySpriteHolding = getNoteSprite('holdBody', activeNoteWidth, 64, true, laneColor);
          const holdProgressSpriteIdle = getNoteSprite('holdProgress', holdProgressWidth, 64, false, laneColor);
          const holdProgressSpriteHolding = getNoteSprite('holdProgress', holdProgressWidth, 64, true, laneColor);
          const holdHighlightSprite = getNoteSprite(
            'holdProgress',
            highlightWidthBase,
            highlightHeightBase,
            false,
            laneColor
          );
          const holdHeadSpriteIdle = getNoteSprite('holdHead', holdHeadWidth, holdHeadHeight, false, laneColor);
          const holdHeadSpriteHolding = getNoteSprite('holdHead', holdHeadWidth, holdHeadHeight, true, laneColor);
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
          const {
            containerTop,
            containerHeight,
            visibleTop,
            visibleBottom,
            holdHeadHeight: segmentHoldHeadHeight,
          } = segment;
          const holdProgress = note.duration
            ? Math.max(0, Math.min(1, (currentTime - note.time) / note.duration))
            : 0;

          const bodyTop = Math.max(visibleTop, containerTop);
          const bodyBottom = Math.min(visibleBottom, containerTop + containerHeight);
          const bodyHeight = bodyBottom - bodyTop;
          if (bodyHeight <= 0) return;

          // Playback rendering stays sprite/stretch based. Expensive path/gradient work is
          // limited to cache creation so long-note cost does not scale with visual length.
          ctx.drawImage(
            isHolding ? holdBodySpriteHolding : holdBodySpriteIdle,
            left,
            bodyTop + activePlayfieldTopOffset,
            activeNoteWidth,
            bodyHeight
          );

          if (!simpleHoldVisuals) {
            const highlightLeft = left + activeNoteWidth * 0.1;
            const highlightTop = containerTop + 4;
            const highlightWidth = activeNoteWidth * 0.8;
            const highlightHeight = 12;
            const highlightBottom = highlightTop + highlightHeight;
            if (highlightBottom >= visibleTop && highlightTop <= visibleBottom) {
              ctx.drawImage(
                holdHighlightSprite,
                highlightLeft,
                highlightTop + activePlayfieldTopOffset,
                highlightWidth,
                highlightHeight
              );
            }
          }

          if (holdProgress > 0 && (!simpleHoldVisuals || isHolding)) {
            const progressHeight = (containerHeight - segmentHoldHeadHeight) * holdProgress;
            const progressTop = containerTop + containerHeight - segmentHoldHeadHeight - progressHeight;
            const progressBottom = containerTop + containerHeight - segmentHoldHeadHeight;
            const visibleProgressTop = Math.max(progressTop, visibleTop);
            const visibleProgressBottom = Math.min(progressBottom, visibleBottom);
            const visibleProgressHeight = visibleProgressBottom - visibleProgressTop;
            if (visibleProgressHeight > 0) {
              const progressLeft = left + activeNoteWidth * 0.18;
              const progressWidth = activeNoteWidth * 0.64;
              ctx.drawImage(
                isHolding ? holdProgressSpriteHolding : holdProgressSpriteIdle,
                progressLeft,
                visibleProgressTop + activePlayfieldTopOffset,
                progressWidth,
                visibleProgressHeight
              );
            }
          }

          const headLeft = left + 6;
          const headTop = containerTop + containerHeight - holdHeadHeight;
          if (headTop + holdHeadHeight >= visibleTop && headTop <= visibleBottom) {
            ctx.drawImage(
              isHolding ? holdHeadSpriteHolding : holdHeadSpriteIdle,
              headLeft,
              headTop + activePlayfieldTopOffset,
              holdHeadWidth,
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
  }, [canvasRef, currentTimeRef, hitNoteIdsRef, visible, laneNoteColors]);

  return null;
};
