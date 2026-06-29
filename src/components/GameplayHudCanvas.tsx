import React, { useEffect, useRef } from 'react';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import {
  GameVisualSettings,
  KEY_LANE_HEIGHT,
  PlayfieldGeometry,
} from '../constants/gameVisualSettings';
import { JUDGE_FEEDBACK_DURATION_MS, KEY_EFFECT_DURATION_MS } from '../constants/gameConstants';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';
import { JudgeType, Lane, GameState } from '../types/game';

interface GameplayHudCanvasProps {
  active: boolean;
  visible: boolean;
  hudRevision: number;
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

const judgeColors: Record<JudgeType, { main: string; soft: string }> = {
  perfect: { main: '#FFD700', soft: 'rgba(255, 215, 0, 0.4)' },
  great: { main: '#00FF00', soft: 'rgba(0, 255, 0, 0.4)' },
  good: { main: '#00BFFF', soft: 'rgba(0, 191, 255, 0.4)' },
  miss: { main: '#FF4500', soft: 'rgba(255, 69, 0, 0.4)' },
};

const laneChromeCache = new Map<string, HTMLCanvasElement>();

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

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

const getFullHudLaneChrome = (
  width: number,
  top: number,
  keys: string[],
  opacity: number,
  glowEnabled: boolean,
  dpr: number
) => {
  const cacheKey = [
    Math.round(width),
    Math.round(top),
    Math.round(opacity * 1000),
    glowEnabled ? 1 : 0,
    dpr,
    keys.join('|'),
  ].join(':');
  const cached = laneChromeCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round((top + KEY_LANE_HEIGHT) * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(dpr, dpr);
  const left = 0;
  const height = KEY_LANE_HEIGHT;
  const alpha = Math.max(0, Math.min(1, opacity));

  ctx.save();
  ctx.globalAlpha = alpha;

  const baseGradient = ctx.createLinearGradient(left, top, left, top + height);
  baseGradient.addColorStop(0, 'rgba(10, 18, 35, 0.84)');
  baseGradient.addColorStop(1, 'rgba(15, 27, 52, 0.74)');
  ctx.fillStyle = baseGradient;
  ctx.strokeStyle = 'rgba(104, 244, 213, 0.36)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 4;
  drawRoundedRect(ctx, left, top, width, height, 12);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  const sheen = ctx.createLinearGradient(left, top, left, top + height);
  sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(0.3, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = sheen;
  drawRoundedRect(ctx, left, top, width, height, 12);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial, sans-serif';
  if (glowEnabled) {
    ctx.shadowColor = 'rgba(255,255,255,0.45)';
    ctx.shadowBlur = 8;
  }
  ctx.fillText(keys[0] ?? '', width / 2, top + 44);
  ctx.shadowBlur = 0;
  if (keys[1]) {
    ctx.font = '16px Arial, sans-serif';
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillText(keys[1], width / 2, top + 68);
    ctx.globalAlpha = alpha;
  }

  const meterHeight = 4;
  const meterLeft = 8;
  const meterTop = top + height - 12;
  const meterWidth = width - 16;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  drawRoundedRect(ctx, meterLeft, meterTop, meterWidth, meterHeight, 999);
  ctx.fill();

  ctx.restore();
  laneChromeCache.set(cacheKey, canvas);
  return canvas;
};

const getJudgeProgress = (feedback: JudgeFeedback, now: number) => {
  const startedAt = feedback.expiresAt - JUDGE_FEEDBACK_DURATION_MS;
  return Math.max(0, Math.min(1, (now - startedAt) / JUDGE_FEEDBACK_DURATION_MS));
};

const getKeyEffectProgress = (effect: KeyEffect, now: number) => {
  const startedAt = effect.expiresAt - KEY_EFFECT_DURATION_MS;
  return Math.max(0, Math.min(1, (now - startedAt) / KEY_EFFECT_DURATION_MS));
};

type NewHudMode = 'new-lite' | 'new-full';

const drawKeyEffect = (
  ctx: CanvasRenderingContext2D,
  effect: KeyEffect,
  now: number,
  mode: NewHudMode
) => {
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
    const width = mode === 'new-full' ? 92 : 64;
    const height = mode === 'new-full' ? 6 : 4;
    if (mode === 'new-full') {
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
    } else {
      ctx.fillStyle = colors.main;
      ctx.fillRect(-width / 2, -height / 2, width, height);
    }
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
  top: number,
  mode: NewHudMode
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
  if (mode === 'new-full') {
    ctx.shadowColor = colors.main;
    ctx.shadowBlur = 40;
    ctx.fillText(feedback.judge.toUpperCase(), 0, 0);
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 20;
  }
  ctx.fillText(feedback.judge.toUpperCase(), 0, 0);
  ctx.restore();
};

const drawLaneTimingFeedback = (
  ctx: CanvasRenderingContext2D,
  feedback: JudgeFeedback,
  now: number,
  mode: NewHudMode
) => {
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
  if (mode === 'new-full') {
    ctx.shadowColor = 'rgba(255, 216, 74, 0.75)';
    ctx.shadowBlur = 12;
  }
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
  mode: NewHudMode,
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
    const dpr = window.devicePixelRatio || 1;
    const laneChrome = getFullHudLaneChrome(width, top, keys, alpha, glowEnabled, dpr);
    ctx.drawImage(laneChrome, left, 0, width, top + height);

    if (isPressed) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.82;
      const pressedOverlay = ctx.createLinearGradient(left, top, left + width, top + height);
      pressedOverlay.addColorStop(0, 'rgba(104, 244, 213, 0.78)');
      pressedOverlay.addColorStop(0.5, 'rgba(255, 173, 102, 0.74)');
      pressedOverlay.addColorStop(1, 'rgba(255, 109, 147, 0.8)');
      ctx.fillStyle = pressedOverlay;
      ctx.shadowColor = 'rgba(104, 244, 213, 0.22)';
      ctx.shadowBlur = glowEnabled ? 16 : 0;
      drawRoundedRect(ctx, left + 3, top + 3, width - 6, height - 6, 10);
      ctx.fill();
      ctx.shadowBlur = 0;

      const sheen = ctx.createLinearGradient(left, top, left, top + height);
      sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
      sheen.addColorStop(0.34, 'rgba(255,255,255,0.03)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = sheen;
      drawRoundedRect(ctx, left + 3, top + 3, width - 6, height - 6, 10);
      ctx.fill();

      const meterHeight = 4;
      const meterLeft = left + 8;
      const meterTop = top + height - 12;
      const meterWidth = width - 16;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      drawRoundedRect(ctx, meterLeft, meterTop, meterWidth, meterHeight, 999);
      ctx.fill();
      ctx.fillStyle = '#68f4d5';
      if (glowEnabled) {
        ctx.shadowColor = 'rgba(104, 244, 213, 0.3)';
        ctx.shadowBlur = 6;
      }
      drawRoundedRect(ctx, meterLeft, meterTop, meterWidth, meterHeight, 999);
      ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = 'rgba(12, 20, 36, 0.88)';
    ctx.strokeStyle = isPressed ? 'rgba(104, 244, 213, 0.78)' : 'rgba(104, 244, 213, 0.36)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    drawRoundedRect(ctx, left, top, width, height, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (isPressed) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = 'rgba(104, 244, 213, 0.64)';
      drawRoundedRect(ctx, left + 3, top + 3, width - 6, height - 6, 10);
      ctx.fill();
      ctx.restore();
    }

    const meterHeight = 4;
    const meterLeft = left + 8;
    const meterTop = top + height - 12;
    const meterWidth = width - 16;
    ctx.fillStyle = isPressed
      ? 'rgba(104, 244, 213, 0.54)'
      : 'rgba(255,255,255,0.18)';
    drawRoundedRect(ctx, meterLeft, meterTop, meterWidth, meterHeight, 999);
    ctx.fill();
    if (isPressed && pulseEnabled) {
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = '#68f4d5';
      drawRoundedRect(ctx, meterLeft, meterTop, meterWidth, meterHeight, 999);
      ctx.fill();
    }
  }

  ctx.restore();
};

const drawCombo = (
  ctx: CanvasRenderingContext2D,
  combo: number,
  laneGroupCenterX: number,
  numberOpacity: number,
  mode: NewHudMode
) => {
  if (combo <= 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = Math.max(0.3, Math.min(1, numberOpacity));
  ctx.fillStyle = 'rgba(245, 252, 255, 0.96)';
  ctx.font = '300 144px Bahnschrift, Arial Narrow, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.36)';
  ctx.shadowBlur = mode === 'new-full' ? 18 : 0;
  ctx.fillText(String(combo), laneGroupCenterX, 118);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(238, 247, 242, 0.64)';
  ctx.font = '700 14px Bahnschrift, Arial Narrow, sans-serif';
  ctx.fillText('COMBO', laneGroupCenterX, 190);
  ctx.restore();
};

export const GameplayHudCanvas: React.FC<GameplayHudCanvasProps> = ({
  active,
  visible,
  hudRevision,
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
  durationMs: _durationMs,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const visibleRef = useRef(visible);
  const activeRef = useRef(active);
  const judgeFeedbackTopRef = useRef(judgeFeedbackTop);
  const playfieldGeometryRef = useRef(playfieldGeometry);
  const gameplayHudModeRef = useRef(gameplayHudMode);
  const laneKeyLabelsRef = useRef(laneKeyLabels);
  const shouldRenderHud = gameplayHudMode !== 'legacy';
  const isLiteMode = gameplayHudMode === 'new-lite';
  const canvasHeight = GAME_VIEW_HEIGHT;

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
      const hudMode = gameplayHudModeRef.current === 'new-full' ? 'new-full' : 'new-lite';
      ctx.clearRect(0, 0, GAME_VIEW_WIDTH, canvasHeight);

      let hasActiveEffect = false;
      if (visibleRef.current) {
        for (const effect of keyEffectsRef.current) {
          if (getKeyEffectProgress(effect, now) < 1) {
            hasActiveEffect = true;
            drawKeyEffect(ctx, effect, now, hudMode);
          }
        }

        for (const feedback of judgeFeedbacksRef.current) {
          if (getJudgeProgress(feedback, now) < 1) {
            hasActiveEffect = true;
            drawJudgeFeedback(ctx, feedback, now, judgeFeedbackTopRef.current, hudMode);
            drawLaneTimingFeedback(ctx, feedback, now, hudMode);
          }
        }

        if (visibleRef.current && activeRef.current && shouldRenderHud) {
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
            geometry.comboOpacity,
            hudMode
          );
        }
      }

      // New Full has expensive gradients/shadows, but the key lanes and combo are static
      // between input/HUD revisions. Keep rAF alive only while animated effects exist.
      const shouldKeepLooping = hasActiveEffect;

      if (shouldKeepLooping) {
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
    hudRevision,
    isLiteMode,
  ]);

  return (
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
        zIndex: 500,
      }}
    />
  );
};
