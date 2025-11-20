import React from 'react';

interface JudgeLineProps {
  left: number;
  width: number;
}

export const JudgeLine: React.FC<JudgeLineProps> = ({ left, width }) => {
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

