import React, { useEffect, useRef, useState } from 'react';
import { Note } from '../types/game';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import { LANE_POSITIONS, NOTE_VISIBILITY_BUFFER_MS } from '../constants/gameConstants';
import { HitNoteIdsRef, isNoteResolved } from '../utils/noteRuntimeState';
import { NoteRenderer } from './NoteRenderer';

const NOTE_SPAWN_Y = -100;
const NOTE_RENDER_BUFFER = 180;
const HOLD_MIN_HEIGHT = 60;

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

const drawRoundedRectCompat = (
  graphics: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: number,
  alpha: number
) => {
  if (typeof graphics.roundRect === 'function') {
    graphics.roundRect(x, y, width, height, radius).fill({ color, alpha });
    return;
  }
  graphics.beginFill(color, alpha);
  graphics.drawRoundedRect(x, y, width, height, radius);
  graphics.endFill();
};

const drawRectCompat = (
  graphics: any,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha: number
) => {
  if (typeof graphics.rect === 'function') {
    graphics.rect(x, y, width, height).fill({ color, alpha });
    return;
  }
  graphics.beginFill(color, alpha);
  graphics.drawRect(x, y, width, height);
  graphics.endFill();
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
  const graphicsRef = useRef<any>(null);
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
        const pixi = await import('pixi.js');
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

        const graphics = new (pixi as any).Graphics();
        app.stage.addChild(graphics);
        appRef.current = app;
        graphicsRef.current = graphics;

        app.ticker.add(() => {
          if (!visibleRef.current) {
            graphics.clear();
            return;
          }

          const renderNotes = notesRef.current;
          const currentTime = currentTimeRef.current;
          const activeFallDuration = fallDurationRef.current;
          const activeJudgeLineY = judgeLineYRef.current;
          const activeLaneCenters = laneCentersRef.current;
          const activeHoldingNotes = holdingNotesRef.current;
          const activeNoteWidth = noteWidthRef.current;
          const activeNoteHeight = noteHeightRef.current;
          const viewportStart = currentTime - activeFallDuration - NOTE_VISIBILITY_BUFFER_MS;
          const viewportEnd = currentTime + activeFallDuration + NOTE_VISIBILITY_BUFFER_MS;

          graphics.clear();
          for (const note of renderNotes) {
            if (isNoteResolved(note, hitNoteIdsRef)) continue;
            if (note.time > viewportEnd || getNoteRenderEndTime(note) < viewportStart) continue;

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
              drawRoundedRectCompat(graphics, left, top, activeNoteWidth, activeNoteHeight, 14, 0xff6b6b, 1);
              continue;
            }

            const endTime = note.endTime ?? note.time + note.duration;
            const isHolding = activeHoldingNotes.has(note.id);
            const headY = isHolding && currentTime >= note.time
              ? activeJudgeLineY + activeNoteHeight / 2
              : getEventY(note.time, currentTime, activeFallDuration, activeJudgeLineY) + activeNoteHeight / 2;
            const tailY = getEventY(endTime, currentTime, activeFallDuration, activeJudgeLineY) - activeNoteHeight / 2;
            const topY = Math.min(headY, tailY);
            const bottomY = Math.max(headY, tailY);
            const height = Math.max(HOLD_MIN_HEIGHT, bottomY - topY);
            const bodyTop = Math.max(-NOTE_RENDER_BUFFER, bottomY - height);
            const bodyBottom = Math.min(GAME_VIEW_HEIGHT + NOTE_RENDER_BUFFER, bottomY);
            const bodyHeight = bodyBottom - bodyTop;
            if (bodyHeight <= 0) continue;

            drawRectCompat(graphics, left, bodyTop, activeNoteWidth, bodyHeight, isHolding ? 0xffc107 : 0x4ecdc4, 0.82);
            drawRoundedRectCompat(
              graphics,
              left + 6,
              bottomY - Math.min(32, Math.max(24, activeNoteHeight)),
              activeNoteWidth - 12,
              Math.min(32, Math.max(24, activeNoteHeight)),
              10,
              0xffffff,
              isHolding ? 0.96 : 0.72
            );
          }
        });
      } catch (error) {
        console.warn('[renderer] WebGL beta failed; falling back to Canvas 2D.', error);
        setFallback(true);
      }
    };

    void mount();
    return () => {
      disposed = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
        graphicsRef.current = null;
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
