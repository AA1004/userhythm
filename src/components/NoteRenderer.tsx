import React, { useEffect, useRef } from 'react';
import { Note } from '../types/game';
import { LANE_POSITIONS } from '../constants/gameConstants';

const HOLD_MIN_HEIGHT = 60;
const HOLD_HEAD_HEIGHT = 32;
const NOTE_SPAWN_Y = -100;

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
      if (!visible || !canvasRef.current) return;

      const currentTime = currentTimeRef.current;
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);

      for (const note of notes) {
        if (note.hit) continue;

        const isHoldNote = note.duration > 0 && note.type === 'hold';
        const laneX = laneCenters[note.lane] ?? LANE_POSITIONS[note.lane];

        const timeUntilHit = note.time - currentTime;
        let headY: number;

        if (timeUntilHit >= fallDuration) {
          headY = NOTE_SPAWN_Y;
        } else {
          const progress = 1 - timeUntilHit / fallDuration;
          headY = NOTE_SPAWN_Y + progress * (judgeLineY - NOTE_SPAWN_Y);
          headY = Math.max(NOTE_SPAWN_Y, Math.min(judgeLineY, headY));
        }

        if (headY < -180 && !isHoldNote) continue;

        if (!isHoldNote) {
          const top = headY - noteHeight / 2;
          const left = laneX - noteWidth / 2;

          const gradient = ctx.createLinearGradient(left, top, left, top + noteHeight);
          gradient.addColorStop(0, '#FF6B6B');
          gradient.addColorStop(1, '#FF9A8B');

          ctx.fillStyle = gradient;
          ctx.strokeStyle = '#EE5A52';
          ctx.lineWidth = 3;
          ctx.beginPath();
          const radius = 14;
          ctx.moveTo(left + radius, top);
          ctx.lineTo(left + noteWidth - radius, top);
          ctx.quadraticCurveTo(left + noteWidth, top, left + noteWidth, top + radius);
          ctx.lineTo(left + noteWidth, top + noteHeight - radius);
          ctx.quadraticCurveTo(left + noteWidth, top + noteHeight, left + noteWidth - radius, top + noteHeight);
          ctx.lineTo(left + radius, top + noteHeight);
          ctx.quadraticCurveTo(left, top + noteHeight, left, top + noteHeight - radius);
          ctx.lineTo(left, top + radius);
          ctx.quadraticCurveTo(left, top, left + radius, top);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          const endTime = note.endTime ?? note.time;
          const timeUntilEnd = endTime - currentTime;

          let tailY: number;
          if (timeUntilEnd >= fallDuration) {
            tailY = NOTE_SPAWN_Y;
          } else {
            const progress = 1 - timeUntilEnd / fallDuration;
            tailY = NOTE_SPAWN_Y + progress * (judgeLineY - NOTE_SPAWN_Y);
            tailY = Math.max(NOTE_SPAWN_Y, Math.min(judgeLineY, tailY));
          }

          const holdHeadY = Math.min(headY, judgeLineY);
          const holdTailY = tailY;
          const bottomY = Math.max(holdHeadY, holdTailY);
          const spanHeight = Math.abs(holdHeadY - holdTailY);
          const containerHeight = Math.max(HOLD_MIN_HEIGHT, spanHeight);
          const containerTop = bottomY - containerHeight;
          const left = laneX - noteWidth / 2;
          const holdHeadHeight = Math.min(HOLD_HEAD_HEIGHT, Math.max(24, noteHeight));

          const isHolding = holdingNotes.has(note.id);
          const holdProgress = note.duration
            ? Math.max(0, Math.min(1, (currentTime - note.time) / note.duration))
            : 0;

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
          ctx.beginPath();
          const radius = 18;
          ctx.moveTo(left + radius, containerTop);
          ctx.lineTo(left + noteWidth - radius, containerTop);
          ctx.quadraticCurveTo(left + noteWidth, containerTop, left + noteWidth, containerTop + radius);
          ctx.lineTo(left + noteWidth, containerTop + containerHeight - radius);
          ctx.quadraticCurveTo(left + noteWidth, containerTop + containerHeight, left + noteWidth - radius, containerTop + containerHeight);
          ctx.lineTo(left + radius, containerTop + containerHeight);
          ctx.quadraticCurveTo(left, containerTop + containerHeight, left, containerTop + containerHeight - radius);
          ctx.lineTo(left, containerTop + radius);
          ctx.quadraticCurveTo(left, containerTop, left + radius, containerTop);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          const highlightRadius = 12;
          const highlightLeft = left + noteWidth * 0.1;
          const highlightTop = containerTop + 4;
          const highlightWidth = noteWidth * 0.8;
          const highlightHeight = 12;
          ctx.moveTo(highlightLeft + highlightRadius, highlightTop);
          ctx.lineTo(highlightLeft + highlightWidth - highlightRadius, highlightTop);
          ctx.quadraticCurveTo(highlightLeft + highlightWidth, highlightTop, highlightLeft + highlightWidth, highlightTop + highlightRadius);
          ctx.lineTo(highlightLeft + highlightWidth, highlightTop + highlightHeight - highlightRadius);
          ctx.quadraticCurveTo(highlightLeft + highlightWidth, highlightTop + highlightHeight, highlightLeft + highlightWidth - highlightRadius, highlightTop + highlightHeight);
          ctx.lineTo(highlightLeft + highlightRadius, highlightTop + highlightHeight);
          ctx.quadraticCurveTo(highlightLeft, highlightTop + highlightHeight, highlightLeft, highlightTop + highlightHeight - highlightRadius);
          ctx.lineTo(highlightLeft, highlightTop + highlightRadius);
          ctx.quadraticCurveTo(highlightLeft, highlightTop, highlightLeft + highlightRadius, highlightTop);
          ctx.closePath();
          ctx.fill();

          if (holdProgress > 0) {
            const progressHeight = (containerHeight - holdHeadHeight) * holdProgress;
            const progressGradient = ctx.createLinearGradient(
              left + noteWidth * 0.18,
              containerTop + containerHeight - holdHeadHeight - progressHeight,
              left + noteWidth * 0.18,
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
            ctx.beginPath();
            const progressRadius = 10;
            const progressLeft = left + noteWidth * 0.18;
            const progressTop = containerTop + containerHeight - holdHeadHeight - progressHeight;
            const progressWidth = noteWidth * 0.64;
            ctx.moveTo(progressLeft + progressRadius, progressTop);
            ctx.lineTo(progressLeft + progressWidth - progressRadius, progressTop);
            ctx.quadraticCurveTo(progressLeft + progressWidth, progressTop, progressLeft + progressWidth, progressTop + progressRadius);
            ctx.lineTo(progressLeft + progressWidth, progressTop + progressHeight - progressRadius);
            ctx.quadraticCurveTo(progressLeft + progressWidth, progressTop + progressHeight, progressLeft + progressWidth - progressRadius, progressTop + progressHeight);
            ctx.lineTo(progressLeft + progressRadius, progressTop + progressHeight);
            ctx.quadraticCurveTo(progressLeft, progressTop + progressHeight, progressLeft, progressTop + progressHeight - progressRadius);
            ctx.lineTo(progressLeft, progressTop + progressRadius);
            ctx.quadraticCurveTo(progressLeft, progressTop, progressLeft + progressRadius, progressTop);
            ctx.closePath();
            ctx.fill();
          }

          const headGradient = ctx.createLinearGradient(
            left + 6,
            containerTop + containerHeight - holdHeadHeight,
            left + 6,
            containerTop + containerHeight
          );
          headGradient.addColorStop(0, 'rgba(255,255,255,0.95)');
          headGradient.addColorStop(1, 'rgba(255,255,255,0.7)');
          ctx.fillStyle = headGradient;
          ctx.beginPath();
          const headRadius = 10;
          const headLeft = left + 6;
          const headTop = containerTop + containerHeight - holdHeadHeight;
          const headWidth = noteWidth - 12;
          ctx.moveTo(headLeft + headRadius, headTop);
          ctx.lineTo(headLeft + headWidth - headRadius, headTop);
          ctx.quadraticCurveTo(headLeft + headWidth, headTop, headLeft + headWidth, headTop + headRadius);
          ctx.lineTo(headLeft + headWidth, headTop + holdHeadHeight - headRadius);
          ctx.quadraticCurveTo(headLeft + headWidth, headTop + holdHeadHeight, headLeft + headWidth - headRadius, headTop + holdHeadHeight);
          ctx.lineTo(headLeft + headRadius, headTop + holdHeadHeight);
          ctx.quadraticCurveTo(headLeft, headTop + holdHeadHeight, headLeft, headTop + holdHeadHeight - headRadius);
          ctx.lineTo(headLeft, headTop + headRadius);
          ctx.quadraticCurveTo(headLeft, headTop, headLeft + headRadius, headTop);
          ctx.closePath();
          ctx.fill();
        }
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
  }, [canvasRef, notes, currentTimeRef, fallDuration, judgeLineY, laneCenters, noteWidth, noteHeight, holdingNotes, visible]);

  return null;
};
