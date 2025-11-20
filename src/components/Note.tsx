import React from 'react';
import { Lane } from '../types/game';

interface NoteProps {
  x: number;
  y: number;
  hit: boolean;
  lane: Lane;
}

export const Note: React.FC<NoteProps> = ({ x, y, hit, lane }) => {
  // 화면 밖에 있는 노트는 렌더링하지 않음
  if (hit && y > 800) return null;
  if (!hit && y < -50) return null;

  // 1,3번 라인 (0, 2)과 2,4번 라인 (1, 3) 색상 차별화
  const isOddLane = lane === 0 || lane === 2; // 1,3번 라인
  const backgroundColor = hit 
    ? '#666' 
    : isOddLane 
    ? '#FF6B6B' // 1,3번 라인: 빨간색 계열
    : '#4ECDC4'; // 2,4번 라인: 청록색 계열
  
  const borderColor = isOddLane 
    ? '#EE5A52' // 1,3번 라인 테두리
    : '#45B7B8'; // 2,4번 라인 테두리

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: '100px', // 키 레인 너비에 딱 맞게
        height: '60px',
        backgroundColor: backgroundColor,
        border: `3px solid ${borderColor}`,
        borderRadius: '8px',
        transform: 'translate(-50%, -50%)',
        opacity: hit ? 0.5 : 1,
        transition: hit ? 'opacity 0.2s' : 'none',
        boxShadow: hit ? 'none' : '0 2px 8px rgba(0,0,0,0.3)',
      }}
    />
  );
};

