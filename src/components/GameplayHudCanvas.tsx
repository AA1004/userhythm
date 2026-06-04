import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import {
  GameVisualSettings,
  KEY_LANE_HEIGHT,
  PlayfieldGeometry,
} from '../constants/gameVisualSettings';
import { JUDGE_FEEDBACK_DURATION_MS } from '../constants/gameConstants';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';
import { JudgeType, Lane, GameState } from '../types/game';

interface GameplayHudCanvasProps {
  portalContainer: HTMLElement | null;
  stageScale: number;
  active: boolean;
  visible: boolean;
  effectsRevision: number;
  judgeFeedbackTop: number;
  judgeFeedbacksRef: React.MutableRefObject<JudgeFeedback[]>;
  keyEffectsRef: React.MutableRefObject<KeyEffect[]>;
  pressedKeysRef: React.MutableRefObject<Set<Lane>>;
  currentTimeRef: React.MutableRefObject<number>;
  scoreRuntimeRef: React.MutableRefObject<GameState['score']>;
  laneKeyLabels: string[][];
  playfieldGeometry: PlayfieldGeometry;
  gameplayHudMode: GameVisualSettings['gameplayHudMode'];
  durationMs: number;
}

const SLOT_HUD_HEIGHT = 82;
const KEY_EFFECT_DURATION_MS = 520;

const judgeColors: Record<JudgeType, { main: string; soft: string }> = {
  perfect: { main: '#FFD700', soft: 'rgba(255, 215, 0, 0.4)' },
  great: { main: '#00FF00', soft: 'rgba(0, 255, 0, 0.4)' },
  good: { main: '#00BFFF', soft: 'rgba(0, 191, 255, 0.4)' },
  miss: { main: '#FF4500', soft: 'rgba(255, 69, 0, 0.4)' },
};

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
};

const getJudgeProgress = (feedback: JudgeFeedback, now: number) => {
  const startedAt = feedback.expiresAt - JUDGE_FEEDBACK_DURATION_MS;
  return Math.max(0, Math.min(1, (now - startedAt) / JUDGE_FEEDBACK_DURATION_MS));
};

const getKeyEffectProgress = (effect: KeyEffect, now: number) => {
  const startedAt = effect.expiresAt - JUDGE_FEEDBACK_DURATION_MS;
  return Math.max(0, Math.min(1, (now - startedAt) / KEY_EFFECT_DURATION_MS));
};

const getAccuracy = (score: GameState['score']) => {
  const total = score.perfect + score.great + score.good + score.miss;
  if (total <= 0) return 0;
  return ((score.perfect * 100 + score.great * 80 + score.good * 50) / (total * 100)) * 100;
};

const drawKeyEffect = (ctx: CanvasRenderingContext2D, effect: KeyEffect, now: number) => {
  const progress = getKeyEffectProgress(effect, now);
  if (progress >= 1) return;

  const colors = judgeColors[effect.judge];
  const alpha = progress < 0.2 ? progress / 0.2 : progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
  const eased = easeOutExpo(progress);
  const scale = 0.65 + (1.18 - 0.65) * eased;
  const rotation = (-40 + 80 * progress) * (Math.PI / 180);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(effect.x, effect.y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  const drawBar = (angle: number) => {
    ctx.save();
    ctx.rotate(angle);
    const width = 92;
    const height = 6;
    const gradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.22, colors.main);
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.78, colors.main);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.shadowColor = colors.soft;
    ctx.shadowBlur = 10;
    drawRoundedRect(ctx, -width / 2, -height / 2, width, height, height / 2);
    ctx.fill();
    ctx.restore();
  };

  drawBar(Math.PI / 4);
  drawBar(-Math.PI / 4);
  ctx.restore();
};

const drawJudgeFeedback = (
  ctx: CanvasRenderingContext2D,
  feedback: JudgeFeedback,
  now: number,
  top: number
) => {
  const progress = getJudgeProgress(feedback, now);
  if (progress >= 1) return;

  const colors = judgeColors[feedback.judge];
  const alpha = progress < 0.2 ? progress / 0.2 : progress < 0.4 ? 1 : 1 - (progress - 0.4) / 0.6;
  const scale =
    progress < 0.2
      ? 0.3 + 0.8 * (progress / 0.2)
      : progress < 0.4
      ? 1.1 - 0.1 * ((progress - 0.2) / 0.2)
      : 1;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(GAME_VIEW_WIDTH / 2, top + 48);
  ctx.scale(scale, scale);
  ctx.font = 'bold 48px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.main;
  ctx.shadowColor = colors.main;
  ctx.shadowBlur = 40;
  ctx.fillText(feedback.judge.toUpperCase(), 0, 0);
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 20;
  ctx.fillText(feedback.judge.toUpperCase(), 0, 0);
  ctx.restore();
};

const drawLaneTimingFeedback = (ctx: CanvasRenderingContext2D, feedback: JudgeFeedback, now: number) => {
  if (!feedback.timingDirection) return;
  const progress = getJudgeProgress(feedback, now);
  if (progress >= 1) return;

  const alpha = progress < 0.2 ? progress / 0.2 : progress < 0.5 ? 1 : 1 - (progress - 0.5) / 0.5;
  const rise = progress * 14;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(feedback.x, feedback.y - 56 - rise);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillStyle = '#FFD84A';
  ctx.shadowColor = 'rgba(255, 216, 74, 0.75)';
  ctx.shadowBlur = 12;
  ctx.fillText(feedback.timingDirection.toUpperCase(), 0, 0);
  ctx.restore();
};

const drawKeyLane = (
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  width: number,
  keys: string[],
  isPressed: boolean,
  opacity: number,
  mode: 'new-lite' | 'new-full',
  glowEnabled: boolean,
  pulseEnabled: boolean
) => {
  const left = x - width / 2;
  const height = KEY_LANE_HEIGHT;
  const alpha = Math.max(0, Math.min(1, opacity));
  const isFull = mode === 'new-full';

  ctx.save();
  ctx.globalAlpha = alpha;

  if (isPressed) {
    ctx.save();
    ctx.globalAlpha = alpha * (isFull ? 1 : 0.7);
    ctx.fillStyle =
      mode === 'new-full'
        ? 'rgba(56, 189, 248, 0.12)'
        : 'rgba(56, 189, 248, 0.08)';
    ctx.fillRect(left, 0, width, top + height);
    ctx.restore();
  }

  if (isFull) {
    const baseGradient = ctx.createLinearGradient(left, top, left, top + height);
    baseGradient.addColorStop(0, 'rgba(10, 18, 35, 0.84)');
    baseGradient.addColorStop(1, 'rgba(15, 27, 52, 0.74)');
    ctx.fillStyle = baseGradient;
  } else {
    ctx.fillStyle = 'rgba(12, 20, 36, 0.88)';
  }
  ctx.strokeStyle = isPressed ? 'rgba(104, 244, 213, 0.78)' : 'rgba(104, 244, 213, 0.36)';
  ctx.lineWidth = 3;
  ctx.shadowColor = glowEnabled && isPressed ? 'rgba(104, 244, 213, 0.2)' : 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = glowEnabled && isPressed ? (isFull ? 14 : 6) : 4;
  drawRoundedRect(ctx, left, top, width, height, 12);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (isPressed) {
    ctx.save();
    ctx.globalAlpha = alpha * (isFull ? 0.95 : 0.72);
    if (isFull) {
      const pressGradient = ctx.createLinearGradient(left, top, left + width, top + height);
      pressGradient.addColorStop(0, 'rgba(104, 244, 213, 0.82)');
      pressGradient.addColorStop(0.5, 'rgba(255, 173, 102, 0.72)');
      pressGradient.addColorStop(1, 'rgba(255, 109, 147, 0.82)');
      ctx.fillStyle = pressGradient;
    } else {
      ctx.fillStyle = 'rgba(104, 244, 213, 0.72)';
    }
    drawRoundedRect(ctx, left + 3, top + 3, width - 6, height - 6, 10);
    ctx.fill();
    ctx.restore();
  }

  if (isFull) {
    const sheen = ctx.createLinearGradient(left, top, left, top + height);
    sheen.addColorStop(0, isPressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)');
    sheen.addColorStop(0.3, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = sheen;
    drawRoundedRect(ctx, left, top, width, height, 12);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial, sans-serif';
  if (glowEnabled) {
    ctx.shadowColor = isFull ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
    ctx.shadowBlur = isFull ? 8 : 3;
  }
  ctx.fillText(keys[0] ?? '', x, top + 44);
  ctx.shadowBlur = 0;
  if (keys[1]) {
    ctx.font = '16px Arial, sans-serif';
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillText(keys[1], x, top + 68);
    ctx.globalAlpha = alpha;
  }

  const meterHeight = 4;
  const meterLeft = left + 8;
  const meterTop = top + height - 12;
  const meterWidth = width - 16;
  ctx.fillStyle = isPressed
    ? mode === 'new-full'
      ? 'rgba(255,255,255,0.24)'
      : 'rgba(104, 244, 213, 0.54)'
    : 'rgba(255,255,255,0.18)';
  drawRoundedRect(ctx, meterLeft, meterTop, meterWidth, meterHeight, 999);
  ctx.fill();
  if (isPressed && pulseEnabled) {
    ctx.globalAlpha = alpha * (isFull ? 1 : 0.7);
    if (isFull) {
      const meterGradient = ctx.createLinearGradient(meterLeft, meterTop, meterLeft + meterWidth, meterTop);
      meterGradient.addColorStop(0, '#68f4d5');
      meterGradient.addColorStop(0.5, '#d3ff78');
      meterGradient.addColorStop(1, '#ff6d93');
      ctx.fillStyle = meterGradient;
    } else {
      ctx.fillStyle = '#68f4d5';
    }
    drawRoundedRect(ctx, meterLeft, meterTop, meterWidth, meterHeight, 999);
    ctx.fill();
  }

  ctx.restore();
};

const drawCombo = (
  ctx: CanvasRenderingContext2D,
  combo: number,
  laneGroupCenterX: number,
  numberOpacity: number
) => {
  if (combo <= 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = Math.max(0.3, Math.min(1, numberOpacity));
  ctx.fillStyle = 'rgba(245, 252, 255, 0.96)';
  ctx.font = '300 144px Bahnschrift, Arial Narrow, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.36)';
  ctx.shadowBlur = 18;
  ctx.fillText(String(combo), laneGroupCenterX, 118);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(238, 247, 242, 0.64)';
  ctx.font = '700 14px Bahnschrift, Arial Narrow, sans-serif';
  ctx.fillText('COMBO', laneGroupCenterX, 190);
  ctx.restore();
};

const drawSlotHud = (
  ctx: CanvasRenderingContext2D,
  geometry: PlayfieldGeometry,
  score: GameState['score'],
  currentTimeMs: number,
  durationMs: number
) => {
  if (!geometry.slotHudEnabled) return;

  const left = geometry.laneGroupLeft;
  const width = geometry.laneGroupWidth;
  const top = geometry.keyLaneY + KEY_LANE_HEIGHT + 8;
  const progress = durationMs > 0 ? clampPercent((currentTimeMs / durationMs) * 100) : 0;
  const accuracy = clampPercent(getAccuracy(score));
  const opacity = Math.max(0.45, Math.min(1, geometry.slotHudOpacity));
  const columns = 3;
  const innerGap = 8;
  const paddingX = 12;
  const paddingTop = 8;
  const cellWidth = (width - paddingX * 2 - innerGap * (columns - 1)) / columns;
  const cellHeight = 42;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = 'rgba(6, 10, 20, 0.88)';
  ctx.strokeStyle = 'rgba(238, 247, 242, 0.18)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, left, top, width, SLOT_HUD_HEIGHT, 14);
  ctx.fill();
  ctx.stroke();

  const topBar = ctx.createLinearGradient(left, top, left + width, top);
  topBar.addColorStop(0, '#68f4d5');
  topBar.addColorStop(0.5, '#ffcf5f');
  topBar.addColorStop(1, '#ff6d93');
  ctx.fillStyle = topBar;
  ctx.fillRect(left, top, width, 2);

  const values = [
    ['COMBO', String(score.combo)],
    ['PROGRESS', `${progress.toFixed(1)}%`],
    ['ACCURACY', `${accuracy.toFixed(2)}%`],
  ];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  values.forEach(([label, value], index) => {
    const cellLeft = left + paddingX + index * (cellWidth + innerGap);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    drawRoundedRect(ctx, cellLeft, top + paddingTop, cellWidth, cellHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(236, 246, 255, 0.58)';
    ctx.font = '700 10px Bahnschrift, Arial Narrow, sans-serif';
    ctx.fillText(label, cellLeft + cellWidth / 2, top + paddingTop + 12);
    ctx.fillStyle = 'rgba(246, 251, 255, 0.96)';
    ctx.font = '700 18px Bahnschrift, Consolas, monospace';
    ctx.fillText(value, cellLeft + cellWidth / 2, top + paddingTop + 28);
  });

  const trackLeft = left + 12;
  const trackTop = top + SLOT_HUD_HEIGHT - 13;
  const trackWidth = width - 24;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  drawRoundedRect(ctx, trackLeft, trackTop, trackWidth, 5, 999);
  ctx.fill();
  const fillWidth = trackWidth * (progress / 100);
  if (fillWidth > 0) {
    const progressGradient = ctx.createLinearGradient(trackLeft, trackTop, trackLeft + trackWidth, trackTop);
    progressGradient.addColorStop(0, '#68f4d5');
    progressGradient.addColorStop(0.5, '#d3ff78');
    progressGradient.addColorStop(1, '#ff6d93');
    ctx.fillStyle = progressGradient;
    drawRoundedRect(ctx, trackLeft, trackTop, fillWidth, 5, 999);
    ctx.fill();
  }

  ctx.restore();
};

export const GameplayHudCanvas: React.FC<GameplayHudCanvasProps> = ({
  portalContainer,
  stageScale,
  active,
  visible,
  effectsRevision,
  judgeFeedbackTop,
  judgeFeedbacksRef,
  keyEffectsRef,
  pressedKeysRef,
  currentTimeRef,
  scoreRuntimeRef,
  laneKeyLabels,
  playfieldGeometry,
  gameplayHudMode,
  durationMs,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const visibleRef = useRef(visible);
  const activeRef = useRef(active);
  const judgeFeedbackTopRef = useRef(judgeFeedbackTop);
  const stageScaleRef = useRef(stageScale);
  const durationRef = useRef(durationMs);
  const playfieldGeometryRef = useRef(playfieldGeometry);
  const gameplayHudModeRef = useRef(gameplayHudMode);
  const laneKeyLabelsRef = useRef(laneKeyLabels);
  const shouldRenderHud = gameplayHudMode !== 'legacy';
  const canvasHeight = Math.max(
    GAME_VIEW_HEIGHT,
    playfieldGeometry.keyLaneY + KEY_LANE_HEIGHT + (playfieldGeometry.slotHudEnabled ? SLOT_HUD_HEIGHT + 12 : 0)
  );

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    judgeFeedbackTopRef.current = judgeFeedbackTop;
  }, [judgeFeedbackTop]);

  useEffect(() => {
    stageScaleRef.current = stageScale;
  }, [stageScale]);

  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);

  useEffect(() => {
    playfieldGeometryRef.current = playfieldGeometry;
  }, [playfieldGeometry]);

  useEffect(() => {
    gameplayHudModeRef.current = gameplayHudMode;
  }, [gameplayHudMode]);

  useEffect(() => {
    laneKeyLabelsRef.current = laneKeyLabels;
  }, [laneKeyLabels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(GAME_VIEW_WIDTH * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    canvas.style.width = `${GAME_VIEW_WIDTH}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [canvasHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const renderFrame = () => {
      const geometry = playfieldGeometryRef.current;
      const now = Date.now();
      ctx.clearRect(0, 0, GAME_VIEW_WIDTH, canvasHeight);

      let hasActiveEffect = false;
      if (visibleRef.current) {
        for (const effect of keyEffectsRef.current) {
          if (getKeyEffectProgress(effect, now) < 1) {
            hasActiveEffect = true;
            drawKeyEffect(ctx, effect, now);
          }
        }

        for (const feedback of judgeFeedbacksRef.current) {
          if (getJudgeProgress(feedback, now) < 1) {
            hasActiveEffect = true;
            drawJudgeFeedback(ctx, feedback, now, judgeFeedbackTopRef.current);
            drawLaneTimingFeedback(ctx, feedback, now);
          }
        }

        if (visibleRef.current && activeRef.current && shouldRenderHud) {
          const hudMode = gameplayHudModeRef.current === 'new-full' ? 'new-full' : 'new-lite';
          geometry.laneCenters.forEach((x, index) => {
            drawKeyLane(
              ctx,
              x,
              geometry.keyLaneY,
              geometry.laneWidth,
              laneKeyLabelsRef.current[index] ?? [],
              pressedKeysRef.current.has(index as Lane),
              geometry.keyLaneOpacity,
              hudMode,
              geometry.keyPressGlowEnabled,
              geometry.keyPressPulseEnabled
            );
          });
          drawCombo(
            ctx,
            scoreRuntimeRef.current.combo,
            geometry.laneGroupLeft + geometry.laneGroupWidth / 2,
            geometry.comboOpacity
          );
          drawSlotHud(ctx, geometry, scoreRuntimeRef.current, currentTimeRef.current, durationRef.current);
        }
      }

      if ((visibleRef.current && shouldRenderHud && activeRef.current) || hasActiveEffect) {
        frameIdRef.current = requestAnimationFrame(renderFrame);
      } else {
        frameIdRef.current = null;
      }
    };

    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current);
    }

    if (!visible && !shouldRenderHud) {
      ctx.clearRect(0, 0, GAME_VIEW_WIDTH, canvasHeight);
      frameIdRef.current = null;
      return;
    }

    frameIdRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [
    canvasHeight,
    currentTimeRef,
    effectsRevision,
    judgeFeedbacksRef,
    keyEffectsRef,
    pressedKeysRef,
    scoreRuntimeRef,
    shouldRenderHud,
    visible,
  ]);

  const portalNode = useMemo(
    () => (
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${GAME_VIEW_WIDTH}px`,
          height: `${canvasHeight}px`,
          pointerEvents: 'none',
          zIndex: 1400,
          transform: `scale(${stageScale})`,
          transformOrigin: 'top left',
        }}
      />
    ),
    [canvasHeight, stageScale]
  );

  if (!portalContainer) return null;
  return createPortal(portalNode, portalContainer);
};
