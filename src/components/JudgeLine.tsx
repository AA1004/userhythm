import React from 'react';

interface JudgeLineProps {
  left: number;
  width: number;
}

const JudgeLineComponent: React.FC<JudgeLineProps> = ({ left, width }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: '640px',
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

