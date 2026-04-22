import React, { useEffect, useRef, useState } from 'react';
import { Note } from '../types/game';
import { LANE_POSITIONS, NOTE_VISIBILITY_BUFFER_MS } from '../constants/gameConstants';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import { HitNoteIdsRef, isNoteResolved } from '../utils/noteRuntimeState';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { NoteRenderer } from './NoteRenderer';

const HOLD_HEAD_HEIGHT = 32;
const HOLD_MIN_HEIGHT = 60;
const NOTE_SPAWN_Y = -100;
const NOTE_RENDER_BUFFER = 180;
const SPRITE_POOL_SIZE = 384;

type SpriteKind = 'tap' | 'holdBody' | 'holdHead' | 'holdProgress' | 'holdHighlight';
type PixiModule = typeof import('pixi.js');

interface WebglBetaNoteRendererProps {
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

interface SpriteEntry {
  sprite: any;
  kind: SpriteKind;
}

const getNoteRenderEndTime = (note: Note) =>
  note.type === 'hold' && note.duration > 0 ? note.endTime || note.time + note.duration : note.time;

const getEventY = (
  eventTime: number,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number
) => {
  const progress = 1 - (eventTime - currentTime) / fallDuration;
  return NOTE_SPAWN_Y + progress * (judgeLineY - NOTE_SPAWN_Y);
};

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
  holding: boolean
) => {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(dpr, dpr);

  if (kind === 'tap') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#FF6B6B');
    gradient.addColorStop(1, '#FF9A8B');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#EE5A52';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 1.5, 1.5, width - 3, height - 3, 14);
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'holdHead') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, holding ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, holding ? 'rgba(255,244,196,0.82)' : 'rgba(255,255,255,0.68)');
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, 0, 0, width, height, 10);
    ctx.fill();
  } else if (kind === 'holdBody') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (holding) {
      gradient.addColorStop(0, 'rgba(255,231,157,0.95)');
      gradient.addColorStop(1, 'rgba(255,193,7,0.65)');
    } else {
      gradient.addColorStop(0, 'rgba(78,205,196,0.9)');
      gradient.addColorStop(1, 'rgba(32,164,154,0.7)');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 0, Math.max(1, width - 2), height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, holding ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, holding ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)');
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
  laneCenters = LANE_POSITIONS,
  noteWidth = 90,
  noteHeight = 42,
  holdingNotes,
  hitNoteIdsRef,
  visible,
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
  const holdingNotesRef = useRef(holdingNotes);
  const fallDurationRef = useRef(fallDuration);
  const judgeLineYRef = useRef(judgeLineY);
  const noteWidthRef = useRef(noteWidth);
  const noteHeightRef = useRef(noteHeight);
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
    holdingNotesRef.current = holdingNotes;
  }, [holdingNotes]);

  useEffect(() => {
    fallDurationRef.current = fallDuration;
  }, [fallDuration]);

  useEffect(() => {
    judgeLineYRef.current = judgeLineY;
  }, [judgeLineY]);

  useEffect(() => {
    noteWidthRef.current = noteWidth;
    noteHeightRef.current = noteHeight;
  }, [noteWidth, noteHeight]);

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
          height: GAME_VIEW_HEIGHT,
          backgroundAlpha: 0,
          antialias: false,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
          preference: 'webgl',
        });
        if (disposed) {
          app.destroy(true);
          return;
        }

        const makeTexture = (kind: SpriteKind, width: number, height: number, holding: boolean) =>
          (pixi as any).Texture.from(makeTextureCanvas(kind, width, height, holding));

        const textures = {
          tap: makeTexture('tap', noteWidthRef.current, noteHeightRef.current, false),
          holdBodyIdle: makeTexture('holdBody', noteWidthRef.current, 64, false),
          holdBodyHolding: makeTexture('holdBody', noteWidthRef.current, 64, true),
          holdHeadIdle: makeTexture('holdHead', Math.max(1, noteWidthRef.current - 12), HOLD_HEAD_HEIGHT, false),
          holdHeadHolding: makeTexture('holdHead', Math.max(1, noteWidthRef.current - 12), HOLD_HEAD_HEIGHT, true),
          holdProgressIdle: makeTexture('holdProgress', Math.max(1, Math.round(noteWidthRef.current * 0.64)), 64, false),
          holdProgressHolding: makeTexture('holdProgress', Math.max(1, Math.round(noteWidthRef.current * 0.64)), 64, true),
          holdHighlight: makeTexture('holdHighlight', Math.max(1, Math.round(noteWidthRef.current * 0.8)), 12, false),
        };
        textureRef.current = textures;

        const stage = new (pixi as any).Container();
        app.stage.addChild(stage);
        stageRef.current = stage;

        const spritePool: SpriteEntry[] = [];
        for (let i = 0; i < SPRITE_POOL_SIZE; i += 1) {
          const sprite = new (pixi as any).Sprite(textures.tap);
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
          const activeLaneCenters = laneCentersRef.current;
          const activeHoldingNotes = holdingNotesRef.current;
          const activeNoteWidth = noteWidthRef.current;
          const activeNoteHeight = noteHeightRef.current;
          const viewportStart = currentTime - activeFallDuration - NOTE_VISIBILITY_BUFFER_MS;
          const viewportEnd = currentTime + activeFallDuration + NOTE_VISIBILITY_BUFFER_MS;
          const startIndex = binarySearchStartIndex(renderNotes, viewportStart);
          const cursor = { value: 0 };
          let drawn = 0;

          const drawHoldNote = (note: Note) => {
            const laneX = activeLaneCenters[note.lane] ?? LANE_POSITIONS[note.lane];
            const left = laneX - activeNoteWidth / 2;
            const endTime = note.endTime ?? note.time + note.duration;
            const isHolding = activeHoldingNotes.has(note.id);
            const visualHalfHeight = activeNoteHeight / 2;
            const visualBottomLimitY = activeJudgeLineY + visualHalfHeight;
            const visualTopLimitY = NOTE_SPAWN_Y - visualHalfHeight;
            const rawHeadY = getEventY(note.time, currentTime, activeFallDuration, activeJudgeLineY);
            const rawTailY = getEventY(endTime, currentTime, activeFallDuration, activeJudgeLineY);
            const headY =
              isHolding && currentTime >= note.time
                ? visualBottomLimitY
                : Math.max(visualTopLimitY, Math.min(visualBottomLimitY, rawHeadY + visualHalfHeight));
            const tailY = Math.max(visualTopLimitY, Math.min(visualBottomLimitY, rawTailY - visualHalfHeight));
            const topY = Math.min(headY, tailY);
            const bottomY = Math.max(headY, tailY);
            const fullHeight = Math.max(HOLD_MIN_HEIGHT, bottomY - topY);
            const containerTop = bottomY - fullHeight;
            const bodyTop = Math.max(-NOTE_RENDER_BUFFER, containerTop);
            const bodyBottom = Math.min(GAME_VIEW_HEIGHT + NOTE_RENDER_BUFFER, containerTop + fullHeight);
            const bodyHeight = bodyBottom - bodyTop;
            if (bodyHeight <= 0) return false;

            const bodySprite = nextSprite(
              cursor,
              'holdBody',
              isHolding ? textures.holdBodyHolding : textures.holdBodyIdle
            );
            if (!bodySprite) return null;
            bodySprite.position.set(left, bodyTop);
            bodySprite.width = activeNoteWidth;
            bodySprite.height = bodyHeight;

            const progress = note.duration ? Math.max(0, Math.min(1, (currentTime - note.time) / note.duration)) : 0;
            if (progress > 0) {
              const progressHeight = (fullHeight - HOLD_HEAD_HEIGHT) * progress;
              const progressTop = containerTop + fullHeight - HOLD_HEAD_HEIGHT - progressHeight;
              const progressBottom = containerTop + fullHeight - HOLD_HEAD_HEIGHT;
              const visibleProgressTop = Math.max(progressTop, -NOTE_RENDER_BUFFER);
              const visibleProgressBottom = Math.min(progressBottom, GAME_VIEW_HEIGHT + NOTE_RENDER_BUFFER);
              if (visibleProgressBottom > visibleProgressTop) {
                const progressSprite = nextSprite(
                  cursor,
                  'holdProgress',
                  isHolding ? textures.holdProgressHolding : textures.holdProgressIdle
                );
                if (!progressSprite) return null;
                progressSprite.position.set(left + activeNoteWidth * 0.18, visibleProgressTop);
                progressSprite.width = activeNoteWidth * 0.64;
                progressSprite.height = visibleProgressBottom - visibleProgressTop;
              }
            }

            const highlightTop = containerTop + 4;
            if (highlightTop + 12 >= -NOTE_RENDER_BUFFER && highlightTop <= GAME_VIEW_HEIGHT + NOTE_RENDER_BUFFER) {
              const highlightSprite = nextSprite(cursor, 'holdHighlight', textures.holdHighlight);
              if (!highlightSprite) return null;
              highlightSprite.position.set(left + activeNoteWidth * 0.1, highlightTop);
              highlightSprite.width = activeNoteWidth * 0.8;
              highlightSprite.height = 12;
            }

            const headHeight = Math.min(HOLD_HEAD_HEIGHT, Math.max(24, activeNoteHeight));
            const headTop = containerTop + fullHeight - headHeight;
            if (headTop + headHeight >= -NOTE_RENDER_BUFFER && headTop <= GAME_VIEW_HEIGHT + NOTE_RENDER_BUFFER) {
              const headSprite = nextSprite(
                cursor,
                'holdHead',
                isHolding ? textures.holdHeadHolding : textures.holdHeadIdle
              );
              if (!headSprite) return null;
              headSprite.position.set(left + 6, headTop);
              headSprite.width = Math.max(1, activeNoteWidth - 12);
              headSprite.height = headHeight;
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
            const left = laneX - activeNoteWidth / 2;
            const isHoldNote = note.type === 'hold' && note.duration > 0;

            if (!isHoldNote) {
              const y = Math.max(
                NOTE_SPAWN_Y,
                Math.min(activeJudgeLineY, getEventY(note.time, currentTime, activeFallDuration, activeJudgeLineY))
              );
              const top = y - activeNoteHeight / 2;
              if (top > activeJudgeLineY + NOTE_RENDER_BUFFER || top + activeNoteHeight < -NOTE_RENDER_BUFFER) {
                continue;
              }
              const sprite = nextSprite(cursor, 'tap', textures.tap);
              if (!sprite) break;
              sprite.position.set(left, top);
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
  }, [currentTimeRef, hitNoteIdsRef]);

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
          laneCenters={laneCenters}
          noteWidth={noteWidth}
          noteHeight={noteHeight}
          holdingNotes={holdingNotes}
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
