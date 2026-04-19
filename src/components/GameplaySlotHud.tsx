import React from 'react';

interface GameplaySlotHudProps {
  laneGroupLeft: number;
  laneGroupWidth: number;
  top: number;
  combo: number;
  accuracy: number;
  progress: number;
  visible: boolean;
  opacity?: number;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const GameplaySlotHudComponent: React.FC<GameplaySlotHudProps> = ({
  laneGroupLeft,
  laneGroupWidth,
  top,
  combo,
  accuracy,
  progress,
  visible,
  opacity = 1,
}) => {
  if (!visible) return null;

  const clampedProgress = clampPercent(progress);
  const clampedAccuracy = clampPercent(accuracy);

  return (
    <div
      className="slot-hud"
      style={{
        left: `${laneGroupLeft}px`,
        width: `${laneGroupWidth}px`,
        top: `${top}px`,
        opacity: Math.max(0.45, Math.min(1, opacity)),
      }}
      aria-label="Gameplay slot HUD"
    >
      <div className="slot-hud__cells">
        <div className="slot-hud__cell">
          <span className="slot-hud__label">COMBO</span>
          <span className="slot-hud__value">{combo}</span>
        </div>
        <div className="slot-hud__cell">
          <span className="slot-hud__label">PROGRESS</span>
          <span className="slot-hud__value">{clampedProgress.toFixed(1)}%</span>
        </div>
        <div className="slot-hud__cell">
          <span className="slot-hud__label">ACCURACY</span>
          <span className="slot-hud__value">{clampedAccuracy.toFixed(2)}%</span>
        </div>
      </div>
      <div className="slot-hud__progress-track" aria-hidden="true">
        <div
          className="slot-hud__progress-fill"
          style={{ transform: `scaleX(${clampedProgress / 100})` }}
        />
      </div>
    </div>
  );
};

export const GameplaySlotHud = React.memo(
  GameplaySlotHudComponent,
  (prev, next) =>
    prev.laneGroupLeft === next.laneGroupLeft &&
    prev.laneGroupWidth === next.laneGroupWidth &&
    prev.top === next.top &&
    prev.combo === next.combo &&
    Math.abs(prev.accuracy - next.accuracy) < 0.005 &&
    Math.abs(prev.progress - next.progress) < 0.05 &&
    prev.visible === next.visible &&
    prev.opacity === next.opacity
);
