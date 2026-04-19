import React from 'react';

interface JudgeLineProps {
  left: number;
  width: number;
  top: number;
  opacity?: number;
}

const JudgeLineComponent: React.FC<JudgeLineProps> = ({ left, width, top, opacity = 1 }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: '4px',
        backgroundColor: '#FF5722',
        boxShadow: '0 0 10px rgba(255, 87, 34, 0.8)',
        opacity,
      }}
    />
  );
};

// React.memo로 불필요한 리렌더링 방지
export const JudgeLine = React.memo(JudgeLineComponent);

