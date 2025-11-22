import React from 'react';
import { Note as NoteType } from '../types/game';

interface NoteProps {
  note: NoteType;
  fallDuration: number;
  currentTime: number;
  judgeLineY: number;
  laneX: number;
}

export const Note: React.FC<NoteProps> = ({
  note,
  fallDuration,
  currentTime,
  judgeLineY,
  laneX,
}) => {
  if (note.hit) return null;

  const timeUntilHit = note.time - currentTime;

  if (timeUntilHit > fallDuration) return null;

  const progress = 1 - timeUntilHit / fallDuration;
  const y = progress * judgeLineY;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${laneX}px`,
        top: `${y}px`,
        width: '100px',
        height: '60px',
        backgroundColor: '#FF6B6B',
        border: '3px solid #EE5A52',
        borderRadius: '12px',
        transform: 'translate(-50%, -50%)',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.4)',
      }}
    />
  );
};
