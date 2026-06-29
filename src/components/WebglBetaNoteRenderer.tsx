import React, { useEffect, useRef, useState } from 'react';
import { Note } from '../types/game';
import { LANE_POSITIONS } from '../constants/gameConstants';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import { HitNoteIdsRef, isNoteResolved } from '../utils/noteRuntimeState';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { NoteRenderer } from './NoteRenderer';
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

const SPRITE_POOL_SIZE = 384;
const WEBGL_NOTE_RENDERER_DPR_LIMIT = 1;

type SpriteKind = 'tap' | 'holdBody' | 'holdHead' | 'holdProgress' | 'holdHighlight';
type PixiModule = typeof import('pixi.js');

interface WebglBetaNoteRendererProps {
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

interface SpriteEntry {
  sprite: any;
  kind: SpriteKind;
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

const makeTextureCanvas = (
  kind: SpriteKind,
  width: number,
  height: number,
  holding: boolean,
  noteColor: NoteColorRgb
) => {
  const canvas = document.createElement('canvas');
  const dpr = WEBGL_NOTE_RENDERER_DPR_LIMIT;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(dpr, dpr);
  const light = lightenNoteColor(noteColor, holding ? 0.34 : 0.18);
  const lighter = lightenNoteColor(noteColor, holding ? 0.52 : 0.32);
  const dark = darkenNoteColor(noteColor, holding ? 0.08 : 0.18);

  if (kind === 'tap') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(lighter));
    gradient.addColorStop(1, noteColorToRgba(dark));
    ctx.fillStyle = gradient;
    ctx.strokeStyle = noteColorToRgba(darkenNoteColor(noteColor, 0.28));
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 1.5, 1.5, width - 3, height - 3, 14);
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'holdHead') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(lightenNoteColor(noteColor, holding ? 0.7 : 0.55), 0.98));
    gradient.addColorStop(1, noteColorToRgba(lighter, holding ? 0.9 : 0.76));
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, 0, 0, width, height, 10);
    ctx.fill();
  } else if (kind === 'holdBody') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(holding ? light : noteColor, holding ? 0.95 : 0.9));
    gradient.addColorStop(1, noteColorToRgba(holding ? noteColor : dark, holding ? 0.74 : 0.7));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = noteColorToRgba(lightenNoteColor(noteColor, 0.42), 0.25);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 0, Math.max(1, width - 2), height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, noteColorToRgba(light, holding ? 0.88 : 0.42));
    gradient.addColorStop(1, noteColorToRgba(lighter, holding ? 0.5 : 0.18));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  return canvas;
};

const binarySearchStartIndex = (notes: Note[], targetTime: number) => {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time < targetTime) low = mid + 1;
    else high = mid;
  }
  return low;
};

const binarySearchHoldEndIndex = (notes: Note[], holdIndicesByEnd: number[], targetTime: number) => {
  let low = 0;
  let high = holdIndicesByEnd.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const note = notes[holdIndicesByEnd[mid]];
    if (getNoteRenderEndTime(note) < targetTime) low = mid + 1;
    else high = mid;
  }
  return low;
};

const hideUnusedSprites = (pool: SpriteEntry[], used: number) => {
  for (let i = used; i < pool.length; i += 1) {
    pool[i].sprite.visible = false;
  }
};

export const WebglBetaNoteRenderer: React.FC<WebglBetaNoteRendererProps> = ({
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const spritePoolRef = useRef<SpriteEntry[]>([]);
  const textureRef = useRef<Record<string, any>>({});
  const holdIndicesByEndRef = useRef<number[]>([]);
  const notesRef = useRef(notes);
  const laneCentersRef = useRef(laneCenters);
  const fallDurationRef = useRef(fallDuration);
  const judgeLineYRef = useRef(judgeLineY);
  const playfieldTopOffsetRef = useRef(playfieldTopOffset);
  const noteWidthRef = useRef(noteWidth);
  const noteHeightRef = useRef(noteHeight);
  const laneNoteColorsRef = useRef(laneNoteColors);
  const visibleRef = useRef(visible);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    notesRef.current = notes;
    holdIndicesByEndRef.current = notes
      .map((note, index) => ({ note, index }))
      .filter(({ note }) => note.type === 'hold' && note.duration > 0)
      .sort((a, b) => getNoteRenderEndTime(a.note) - getNoteRenderEndTime(b.note))
      .map(({ index }) => index);
  }, [notes]);

  useEffect(() => {
    laneCentersRef.current = laneCenters;
  }, [laneCenters]);

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
    let disposed = false;

    const mount = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        const pixi: PixiModule = await import('pixi.js');
        if (disposed) return;

        const app = new (pixi as any).Application();
        await app.init({
          canvas,
          width: GAME_VIEW_WIDTH,
          height: GAME_VIEW_HEIGHT + playfieldTopOffsetRef.current,
          backgroundAlpha: 0,
          antialias: false,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, WEBGL_NOTE_RENDERER_DPR_LIMIT),
          preference: 'webgl',
        });
        if (disposed) {
          app.destroy(true);
          return;
        }

        const stage = new (pixi as any).Container();
        app.stage.addChild(stage);
        stageRef.current = stage;

        const spritePool: SpriteEntry[] = [];
        for (let i = 0; i < SPRITE_POOL_SIZE; i += 1) {
          const sprite = new (pixi as any).Sprite((pixi as any).Texture.WHITE);
          sprite.visible = false;
          stage.addChild(sprite);
          spritePool.push({ sprite, kind: 'tap' });
        }
        spritePoolRef.current = spritePool;
        appRef.current = app;

        const nextSprite = (cursor: { value: number }, kind: SpriteKind, texture: any) => {
          if (cursor.value >= spritePoolRef.current.length) return null;
          const entry = spritePoolRef.current[cursor.value];
          cursor.value += 1;
          if (entry.kind !== kind || entry.sprite.texture !== texture) {
            entry.kind = kind;
            entry.sprite.texture = texture;
          }
          entry.sprite.visible = true;
          entry.sprite.alpha = 1;
          return entry.sprite;
        };

        app.ticker.add(() => {
          if (!visibleRef.current) {
            hideUnusedSprites(spritePoolRef.current, 0);
            return;
          }

          const shouldProfile = isGameplayProfilerEnabled();
          const profileStart = shouldProfile ? performance.now() : 0;
          const poolStart = shouldProfile ? performance.now() : 0;
          const renderNotes = notesRef.current;
          const holdIndicesByEnd = holdIndicesByEndRef.current;
          const currentTime = currentTimeRef.current;
          const activeFallDuration = fallDurationRef.current;
          const activeJudgeLineY = judgeLineYRef.current;
          const activePlayfieldTopOffset = playfieldTopOffsetRef.current;
          const activeLaneCenters = laneCentersRef.current;
          const activeLaneNoteColors = laneNoteColorsRef.current;
          const activeHoldingNotes = holdingNotesRef.current;
          const activeNoteWidth = noteWidthRef.current;
          const activeNoteHeight = noteHeightRef.current;
          const viewportStart = getNoteViewportStart(currentTime, activeFallDuration);
          const viewportEnd = getNoteViewportEnd(currentTime, activeFallDuration);
          const startIndex = binarySearchStartIndex(renderNotes, viewportStart);
          const cursor = { value: 0 };
          let drawn = 0;

          const textureCacheKey = `${activeNoteWidth}:${activeNoteHeight}:${activeLaneNoteColors
            .map(noteColorKey)
            .join('|')}`;
          if (textureRef.current.cacheKey !== textureCacheKey) {
            const makeTexture = (kind: SpriteKind, width: number, height: number, holding: boolean, noteColor: NoteColorRgb) =>
              (pixi as any).Texture.from(makeTextureCanvas(kind, width, height, holding, noteColor));
            textureRef.current = {
              cacheKey: textureCacheKey,
              byLane: activeLaneNoteColors.map((laneNoteColor) => ({
                tap: makeTexture('tap', activeNoteWidth, activeNoteHeight, false, laneNoteColor),
                holdBodyIdle: makeTexture('holdBody', activeNoteWidth, 64, false, laneNoteColor),
                holdBodyHolding: makeTexture('holdBody', activeNoteWidth, 64, true, laneNoteColor),
                holdHeadIdle: makeTexture('holdHead', Math.max(1, activeNoteWidth - 12), HOLD_HEAD_HEIGHT, false, laneNoteColor),
                holdHeadHolding: makeTexture('holdHead', Math.max(1, activeNoteWidth - 12), HOLD_HEAD_HEIGHT, true, laneNoteColor),
                holdProgressIdle: makeTexture('holdProgress', Math.max(1, Math.round(activeNoteWidth * 0.64)), 64, false, laneNoteColor),
                holdProgressHolding: makeTexture('holdProgress', Math.max(1, Math.round(activeNoteWidth * 0.64)), 64, true, laneNoteColor),
                holdHighlight: makeTexture('holdHighlight', Math.max(1, Math.round(activeNoteWidth * 0.8)), 12, false, laneNoteColor),
              })),
            };
          }
          const texturesByLane = textureRef.current.byLane;

          const drawHoldNote = (note: Note) => {
            const laneX = activeLaneCenters[note.lane] ?? LANE_POSITIONS[note.lane];
            const laneTextures = texturesByLane[note.lane];
            const left = laneX - activeNoteWidth / 2;
            const isHolding = activeHoldingNotes.has(note.id);
            const segment = computeHoldRenderSegment(
              note,
              currentTime,
              activeFallDuration,
              activeJudgeLineY,
              activeNoteHeight,
              isHolding,
              GAME_VIEW_HEIGHT + activePlayfieldTopOffset
            );
            if (!segment) return false;
            const {
              containerTop,
              containerHeight,
              visibleTop,
              visibleBottom,
              holdHeadHeight,
            } = segment;
            const bodyTop = Math.max(visibleTop, containerTop);
            const bodyBottom = Math.min(visibleBottom, containerTop + containerHeight);
            const bodyHeight = bodyBottom - bodyTop;
            if (bodyHeight <= 0) return false;

            const bodySprite = nextSprite(
              cursor,
              'holdBody',
              isHolding ? laneTextures.holdBodyHolding : laneTextures.holdBodyIdle
            );
            if (!bodySprite) return null;
            bodySprite.position.set(left, bodyTop + activePlayfieldTopOffset);
            bodySprite.width = activeNoteWidth;
            bodySprite.height = bodyHeight;

            const progress = note.duration ? Math.max(0, Math.min(1, (currentTime - note.time) / note.duration)) : 0;
            if (progress > 0 && (!simpleHoldVisuals || isHolding)) {
              const progressHeight = (containerHeight - holdHeadHeight) * progress;
              const progressTop = containerTop + containerHeight - holdHeadHeight - progressHeight;
              const progressBottom = containerTop + containerHeight - holdHeadHeight;
              const visibleProgressTop = Math.max(progressTop, visibleTop);
              const visibleProgressBottom = Math.min(progressBottom, visibleBottom);
              if (visibleProgressBottom > visibleProgressTop) {
                const progressSprite = nextSprite(
                  cursor,
                  'holdProgress',
                  isHolding ? laneTextures.holdProgressHolding : laneTextures.holdProgressIdle
                );
                if (!progressSprite) return null;
                progressSprite.position.set(
                  left + activeNoteWidth * 0.18,
                  visibleProgressTop + activePlayfieldTopOffset
                );
                progressSprite.width = activeNoteWidth * 0.64;
                progressSprite.height = visibleProgressBottom - visibleProgressTop;
              }
            }

            if (!simpleHoldVisuals) {
              const highlightTop = containerTop + 4;
              if (highlightTop + 12 >= visibleTop && highlightTop <= visibleBottom) {
                const highlightSprite = nextSprite(cursor, 'holdHighlight', laneTextures.holdHighlight);
                const highlightTexture = laneTextures.holdHighlight;
                if (!highlightSprite) return null;
                if (highlightSprite.texture !== highlightTexture) {
                  highlightSprite.texture = highlightTexture;
                }
                highlightSprite.position.set(
                  left + activeNoteWidth * 0.1,
                  highlightTop + activePlayfieldTopOffset
                );
                highlightSprite.width = activeNoteWidth * 0.8;
                highlightSprite.height = 12;
              }
            }

            const headTop = containerTop + containerHeight - holdHeadHeight;
            if (headTop + holdHeadHeight >= visibleTop && headTop <= visibleBottom) {
              const headSprite = nextSprite(
                cursor,
                'holdHead',
                isHolding ? laneTextures.holdHeadHolding : laneTextures.holdHeadIdle
              );
              if (!headSprite) return null;
              headSprite.position.set(left + 6, headTop + activePlayfieldTopOffset);
              headSprite.width = Math.max(1, activeNoteWidth - 12);
              headSprite.height = holdHeadHeight;
            }
            drawn += 1;
            return true;
          };

          const firstVisibleHoldIndex = binarySearchHoldEndIndex(renderNotes, holdIndicesByEnd, viewportStart);
          for (let holdCursor = firstVisibleHoldIndex; holdCursor < holdIndicesByEnd.length; holdCursor += 1) {
            const note = renderNotes[holdIndicesByEnd[holdCursor]];
            if (note.time >= viewportStart) continue;
            if (note.time > viewportEnd) break;
            if (isNoteResolved(note, hitNoteIdsRef)) continue;
            const result = drawHoldNote(note);
            if (result === null) break;
          }

          for (let i = startIndex; i < renderNotes.length; i += 1) {
            const note = renderNotes[i];
            if (note.time > viewportEnd) break;
            if (isNoteResolved(note, hitNoteIdsRef)) continue;
            if (getNoteRenderEndTime(note) < viewportStart) continue;

            const laneX = activeLaneCenters[note.lane] ?? LANE_POSITIONS[note.lane];
            const laneTextures = texturesByLane[note.lane];
            const isHoldNote = note.type === 'hold' && note.duration > 0;

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
              if (!position) {
                continue;
              }
              const sprite = nextSprite(cursor, 'tap', laneTextures.tap);
              if (!sprite) break;
              sprite.position.set(position.left, position.top + activePlayfieldTopOffset);
              sprite.width = activeNoteWidth;
              sprite.height = activeNoteHeight;
              drawn += 1;
              continue;
            }

            const result = drawHoldNote(note);
            if (result === null) break;
          }

          hideUnusedSprites(spritePoolRef.current, cursor.value);
          if (shouldProfile) {
            recordGameplayMetric('spritePoolUpdate', performance.now() - poolStart, cursor.value);
            recordGameplayMetric('webglRender', performance.now() - profileStart, drawn);
          }
        });
      } catch (error) {
        console.warn('[renderer] WebGL failed; falling back to Canvas 2D.', error);
        setFallback(true);
      }
    };

    void mount();
    return () => {
      disposed = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
        stageRef.current = null;
        spritePoolRef.current = [];
        textureRef.current = {};
      }
    };
  }, [currentTimeRef, hitNoteIdsRef, laneNoteColors, playfieldTopOffset]);

  if (fallback) {
    return (
      <>
        <canvas
          ref={fallbackCanvasRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />
        <NoteRenderer
          canvasRef={fallbackCanvasRef}
          notes={notes}
          currentTimeRef={currentTimeRef}
          fallDuration={fallDuration}
          judgeLineY={judgeLineY}
          playfieldTopOffset={playfieldTopOffset}
          laneCenters={laneCenters}
          noteWidth={noteWidth}
          noteHeight={noteHeight}
          laneNoteColors={laneNoteColors}
          holdingNotesRef={holdingNotesRef}
          hitNoteIdsRef={hitNoteIdsRef}
          visible={visible}
        />
      </>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  );
};
