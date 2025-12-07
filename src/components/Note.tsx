import React from 'react';
import { Note as NoteType } from '../types/game';

interface NoteProps {
  note: NoteType;
  fallDuration: number;
  currentTime: number;
  judgeLineY: number;
  laneX: number;
  isHolding?: boolean;
}

const NOTE_WIDTH = 90;
const TAP_HEIGHT = 42;
const HOLD_MIN_HEIGHT = 60;
const HOLD_HEAD_HEIGHT = 32;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const Note: React.FC<NoteProps> = ({
  note,
  fallDuration,
  currentTime,
  judgeLineY,
  laneX,
  isHolding = false,
}) => {
  if (note.hit) return null;

  const isHoldNote = note.duration > 0 && note.type === 'hold';

  const computeY = (timeMs: number, clampToJudgeLine = false) => {
    const timeUntilHit = timeMs - currentTime;
    const progress = 1 - timeUntilHit / fallDuration;
    const maxY = clampToJudgeLine ? judgeLineY : judgeLineY + 50;
    return clamp(progress * judgeLineY, -200, maxY);
  };

  const headY = computeY(note.time);

  if (!isHoldNote) {
    if (headY < -180) return null;
    const top = headY - TAP_HEIGHT / 2;
    return (
      <div
        style={{
          position: 'absolute',
          left: `${laneX - NOTE_WIDTH / 2}px`,
          top: `${top}px`,
          width: `${NOTE_WIDTH}px`,
          height: `${TAP_HEIGHT}px`,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '14px',
            background: 'linear-gradient(180deg, #FF6B6B 0%, #FF9A8B 100%)',
            border: '3px solid #EE5A52',
            boxShadow: '0 6px 14px rgba(0, 0, 0, 0.45)',
          }}
        />
      </div>
    );
  }

  const holdHeadY = computeY(note.time, true);
  const holdTailY = computeY(note.endTime ?? note.time, true);
  const bottomY = Math.max(holdHeadY, holdTailY);
  const spanHeight = Math.abs(holdHeadY - holdTailY);
  const containerHeight = Math.max(HOLD_MIN_HEIGHT, spanHeight);
  const containerTop = bottomY - containerHeight;
  const holdProgress = note.duration
    ? clamp((currentTime - note.time) / note.duration, 0, 1)
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${laneX - NOTE_WIDTH / 2}px`,
        top: `${containerTop}px`,
        width: `${NOTE_WIDTH}px`,
        height: `${containerHeight}px`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '18px',
          border: '2px solid rgba(255,255,255,0.25)',
          background: isHolding
            ? 'linear-gradient(180deg, rgba(255,231,157,0.95) 0%, rgba(255,193,7,0.65) 100%)'
            : 'linear-gradient(180deg, rgba(78,205,196,0.9) 0%, rgba(32,164,154,0.7) 100%)',
          boxShadow: isHolding
            ? '0 0 18px rgba(255, 214, 102, 0.8)'
            : '0 6px 16px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: '10%',
            right: '10%',
            height: 12,
            borderRadius: '12px 12px 6px 6px',
            backgroundColor: 'rgba(255,255,255,0.4)',
            boxShadow: '0 0 8px rgba(255,255,255,0.35)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: '18%',
            right: '18%',
            bottom: HOLD_HEAD_HEIGHT,
            height: `${holdProgress * 100}%`,
            borderRadius: '10px',
            background: isHolding
              ? 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.4) 70%)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.15) 70%)',
            boxShadow: isHolding
              ? '0 0 12px rgba(255,255,255,0.7)'
              : undefined,
            transition: 'height 80ms linear',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            bottom: 0,
            height: HOLD_HEAD_HEIGHT,
            borderRadius: '10px',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.7) 100%)',
            boxShadow: isHolding
              ? '0 0 14px rgba(255, 255, 255, 0.9)'
              : '0 4px 10px rgba(0,0,0,0.35)',
          }}
        />
      </div>
    </div>
  );
};
