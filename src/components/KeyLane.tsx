import React from 'react';

interface KeyLaneProps {
  x: number;
  top: number;
  width?: number;
  keys: string[];
  isPressed: boolean;
  opacity?: number;
}

const KeyLaneComponent: React.FC<KeyLaneProps> = ({ x, top, width = 100, keys, isPressed, opacity = 1 }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: '100px',
        backgroundColor: isPressed ? '#FFC107' : '#2196F3',
        border: '3px solid #1976D2',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        transform: 'translateX(-50%)',
        transition: 'background-color 0.1s',
        boxShadow: isPressed
          ? '0 0 20px rgba(255, 193, 7, 0.6)'
          : '0 4px 8px rgba(0,0,0,0.3)',
        opacity,
      }}
    >
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
        {keys[0]}
      </div>
      {keys[1] && (
        <div style={{ fontSize: '16px', color: '#fff', marginTop: '4px' }}>
          {keys[1]}
        </div>
      )}
    </div>
  );
};

export const KeyLane = React.memo(KeyLaneComponent, (prevProps, nextProps) => {
  return (
    prevProps.x === nextProps.x &&
    prevProps.top === nextProps.top &&
    prevProps.width === nextProps.width &&
    prevProps.isPressed === nextProps.isPressed &&
    prevProps.opacity === nextProps.opacity &&
    prevProps.keys.length === nextProps.keys.length &&
    prevProps.keys.every((key, i) => key === nextProps.keys[i])
  );
});
