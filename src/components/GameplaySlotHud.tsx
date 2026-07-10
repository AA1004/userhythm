import React, { useEffect, useRef } from 'react';
import { GameState } from '../types/game';
import { calculateScoreAccuracy } from '../utils/scoreAccuracy';

interface GameplaySlotHudProps {
  laneGroupLeft: number;
  laneGroupWidth: number;
  top: number;
  combo: number;
  accuracy: number;
  progress: number;
  currentTimeRef?: React.MutableRefObject<number>;
  scoreRuntimeRef?: React.MutableRefObject<GameState['score']>;
  durationMs?: number;
  visible: boolean;
  opacity?: number;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const GAMEPLAY_HUD_PAINT_EVENT = 'userhythm:gameplay-hud-paint';

const GameplaySlotHudComponent: React.FC<GameplaySlotHudProps> = ({
  laneGroupLeft,
  laneGroupWidth,
  top,
  combo,
  accuracy,
  progress,
  currentTimeRef,
  scoreRuntimeRef,
  durationMs = 0,
  visible,
  opacity = 1,
}) => {
  const comboValueRef = useRef<HTMLSpanElement | null>(null);
  const accuracyValueRef = useRef<HTMLSpanElement | null>(null);
  const progressValueRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) return;

    let timerId: number | null = null;
    let lastRendered = -1;
    let lastCombo = -1;
    let lastAccuracy = -1;

    const renderScore = () => {
      if (!scoreRuntimeRef) return;
      const score = scoreRuntimeRef.current;
      const nextAccuracy = Math.round(calculateScoreAccuracy(score) * 100) / 100;
      if (score.combo !== lastCombo) {
        lastCombo = score.combo;
        if (comboValueRef.current) {
          comboValueRef.current.textContent = String(score.combo);
        }
      }
      if (Math.abs(nextAccuracy - lastAccuracy) >= 0.01) {
        lastAccuracy = nextAccuracy;
        if (accuracyValueRef.current) {
          accuracyValueRef.current.textContent = `${nextAccuracy.toFixed(2)}%`;
        }
      }
    };

    const tick = () => {
      if (currentTimeRef && durationMs > 0) {
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
      }
      renderScore();
    };

    tick();
    timerId = window.setInterval(tick, 100);
    window.addEventListener(GAMEPLAY_HUD_PAINT_EVENT, renderScore);
    return () => {
      window.removeEventListener(GAMEPLAY_HUD_PAINT_EVENT, renderScore);
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, [currentTimeRef, durationMs, scoreRuntimeRef, visible]);

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
          <span ref={comboValueRef} className="slot-hud__value slot-hud__value--combo">{combo}</span>
        </div>
        <div className="slot-hud__cell">
          <span className="slot-hud__label">PROGRESS</span>
          <span ref={progressValueRef} className="slot-hud__value">{clampedProgress.toFixed(1)}%</span>
        </div>
        <div className="slot-hud__cell">
          <span className="slot-hud__label">ACCURACY</span>
          <span ref={accuracyValueRef} className="slot-hud__value">{clampedAccuracy.toFixed(2)}%</span>
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
    prev.scoreRuntimeRef === next.scoreRuntimeRef &&
    prev.durationMs === next.durationMs &&
    prev.visible === next.visible &&
    prev.opacity === next.opacity
);
