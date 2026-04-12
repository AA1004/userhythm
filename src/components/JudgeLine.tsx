import React from 'react';

interface JudgeLineProps {
  left: number;
  width: number;
  top: number;
}

const JudgeLineComponent: React.FC<JudgeLineProps> = ({ left, width, top }) => {
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
      }}
    />
  );
};

// React.memo로 불필요한 리렌더링 방지
export const JudgeLine = React.memo(JudgeLineComponent);

