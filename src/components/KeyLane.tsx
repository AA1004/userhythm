import React from 'react';

type KeyLaneStyleVariant = 'legacy' | 'new';

interface KeyLaneProps {
  x: number;
  top: number;
  width?: number;
  keys: string[];
  isPressed: boolean;
  opacity?: number;
  styleVariant?: KeyLaneStyleVariant;
  glowEnabled?: boolean;
  pulseEnabled?: boolean;
}

const KeyLaneComponent: React.FC<KeyLaneProps> = ({
  x,
  top,
  width = 100,
  keys,
  isPressed,
  opacity = 1,
  styleVariant = 'legacy',
  glowEnabled = true,
  pulseEnabled = true,
}) => {
  const isNewVariant = styleVariant === 'new';
  const laneBackgroundColor = isNewVariant
    ? isPressed
      ? 'linear-gradient(160deg, rgba(104, 244, 213, 0.85), rgba(255, 173, 102, 0.82), rgba(255, 109, 147, 0.85))'
      : 'linear-gradient(170deg, rgba(10, 18, 35, 0.84), rgba(15, 27, 52, 0.74))'
    : isPressed
    ? '#FFC107'
    : '#2196F3';
  const laneBorderColor = isNewVariant
    ? isPressed
      ? 'rgba(245, 252, 255, 0.88)'
      : 'rgba(104, 244, 213, 0.44)'
    : '#1976D2';
  const laneShadow = isNewVariant
    ? isPressed
      ? glowEnabled
        ? '0 0 20px rgba(104, 244, 213, 0.45), 0 10px 18px rgba(255, 109, 147, 0.24)'
        : '0 6px 14px rgba(0, 0, 0, 0.3)'
      : glowEnabled
      ? '0 6px 14px rgba(0, 0, 0, 0.28), 0 0 14px rgba(104, 244, 213, 0.12)'
      : '0 6px 14px rgba(0, 0, 0, 0.28)'
    : isPressed && glowEnabled
    ? '0 0 20px rgba(255, 193, 7, 0.6)'
    : '0 4px 8px rgba(0,0,0,0.3)';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: '100px',
        background: laneBackgroundColor,
        border: `3px solid ${laneBorderColor}`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        transform:
          pulseEnabled && isPressed
            ? 'translateX(-50%) translateY(2px) scale(0.97)'
            : 'translateX(-50%) scale(1)',
        transition: 'transform 40ms ease, opacity 80ms linear',
        willChange: 'transform',
        boxShadow: laneShadow,
        opacity,
        overflow: 'hidden',
      }}
    >
      {isNewVariant && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: isPressed
              ? 'linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.02) 36%, rgba(0,0,0,0.08) 100%)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02) 30%, rgba(0,0,0,0.08) 100%)',
          }}
        />
      )}
      <div
        style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#fff',
          textShadow: isNewVariant ? '0 0 8px rgba(255,255,255,0.45)' : 'none',
          zIndex: 1,
        }}
      >
        {keys[0]}
      </div>
      {keys[1] && (
        <div
          style={{
            fontSize: '16px',
            color: '#fff',
            marginTop: '4px',
            opacity: 0.9,
            zIndex: 1,
          }}
        >
          {keys[1]}
        </div>
      )}
      {isNewVariant && (
        <div
          style={{
            position: 'absolute',
            left: '8px',
            right: '8px',
            bottom: '8px',
            height: '4px',
            borderRadius: '999px',
            background: isPressed
              ? 'linear-gradient(90deg, #68f4d5, #d3ff78, #ffad66, #ff6d93)'
              : 'rgba(255, 255, 255, 0.18)',
            boxShadow: isPressed && glowEnabled ? '0 0 10px rgba(104, 244, 213, 0.45)' : 'none',
          }}
        />
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
    prevProps.styleVariant === nextProps.styleVariant &&
    prevProps.glowEnabled === nextProps.glowEnabled &&
    prevProps.pulseEnabled === nextProps.pulseEnabled &&
    prevProps.keys.length === nextProps.keys.length &&
    prevProps.keys.every((key, i) => key === nextProps.keys[i])
  );
});
