import React, { useEffect, useRef } from 'react';

interface GameplaySlotHudProps {
  laneGroupLeft: number;
  laneGroupWidth: number;
  top: number;
  combo: number;
  accuracy: number;
  progress: number;
  currentTimeRef?: React.MutableRefObject<number>;
  durationMs?: number;
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
  currentTimeRef,
  durationMs = 0,
  visible,
  opacity = 1,
}) => {
  const progressValueRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!currentTimeRef || durationMs <= 0 || !visible) return;

    let timerId: number | null = null;
    let lastRendered = -1;
    const tick = () => {
      const nextProgress = clampPercent((currentTimeRef.current / durationMs) * 100);
      const rounded = Math.round(nextProgress * 10) / 10;
      if (Math.abs(rounded - lastRendered) >= 0.1) {
        lastRendered = rounded;
        if (progressValueRef.current) {
          progressValueRef.current.textContent = `${rounded.toFixed(1)}%`;
        }
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${nextProgress / 100})`;
        }
      }
    };

    tick();
    timerId = window.setInterval(tick, 100);
    return () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, [currentTimeRef, durationMs, visible]);

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
          <span ref={progressValueRef} className="slot-hud__value">{clampedProgress.toFixed(1)}%</span>
        </div>
        <div className="slot-hud__cell">
          <span className="slot-hud__label">ACCURACY</span>
          <span className="slot-hud__value">{clampedAccuracy.toFixed(2)}%</span>
        </div>
      </div>
      <div className="slot-hud__progress-track" aria-hidden="true">
        <div
          ref={progressFillRef}
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
    prev.currentTimeRef === next.currentTimeRef &&
    prev.durationMs === next.durationMs &&
    prev.visible === next.visible &&
    prev.opacity === next.opacity
);
