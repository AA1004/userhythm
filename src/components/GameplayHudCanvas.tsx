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
  playfieldTopOffset?: number;
  gameplayHudMode: GameVisualSettings['gameplayHudMode'];
  durationMs: number;
  opacity?: number;
}

const judgeColors: Record<JudgeType, { main: string; soft: string }> = {
  perfect: { main: '#FFD700', soft: 'rgba(255, 215, 0, 0.4)' },
  great: { main: '#00FF00', soft: 'rgba(0, 255, 0, 0.4)' },
  good: { main: '#00BFFF', soft: 'rgba(0, 191, 255, 0.4)' },
  miss: { main: '#FF4500', soft: 'rgba(255, 69, 0, 0.4)' },
};

const laneChromeCache = new Map<string, HTMLCanvasElement>();
const GAMEPLAY_HUD_CANVAS_DPR_LIMIT = 1;
const SLOT_HUD_HEIGHT = 82;
const SLOT_HUD_GAP = 8;
const SLOT_PROGRESS_PAINT_STEP_MS = 100;

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
  pulseEnabled: boolean,
  playfieldTopOffset: number = 0
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
    ctx.fillRect(left, -playfieldTopOffset, width, playfieldTopOffset + top + height);
    ctx.restore();
  }

  if (isFull) {
    const dpr = Math.min(window.devicePixelRatio || 1, GAMEPLAY_HUD_CANVAS_DPR_LIMIT);
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

const getAccuracy = (score: GameState['score']) => {
  const total = score.perfect + score.great + score.good + score.miss;
  if (total === 0) return 100;
  return ((score.perfect + score.great * 0.7 + score.good * 0.3) / total) * 100;
};

const getPressedLaneMask = (pressedKeys: Set<Lane>) => {
  let mask = 0;
  for (const lane of pressedKeys) {
    mask |= 1 << lane;
  }
  return mask;
};

const drawSlotHud = (
  ctx: CanvasRenderingContext2D,
  geometry: PlayfieldGeometry,
  score: GameState['score'],
  currentTime: number,
  durationMs: number,
  mode: NewHudMode
) => {
  if (!geometry.slotHudEnabled) return;

  const x = geometry.laneGroupLeft;
  const y = geometry.keyLaneY + KEY_LANE_HEIGHT + SLOT_HUD_GAP;
  const width = geometry.laneGroupWidth;
  const height = SLOT_HUD_HEIGHT;
  const opacity = Math.max(0, Math.min(1, geometry.slotHudOpacity));
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, currentTime / durationMs)) : 0;
  const accuracy = getAccuracy(score);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = 'rgba(6, 10, 20, 0.86)';
  ctx.strokeStyle = 'rgba(238, 247, 242, 0.18)';
  ctx.lineWidth = 1;
  if (mode === 'new-full') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 12;
  }
  drawRoundedRect(ctx, x, y, width, height, 14);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  const topLineGradient = ctx.createLinearGradient(x, y, x + width, y);
  topLineGradient.addColorStop(0, '#68f4d5');
  topLineGradient.addColorStop(0.5, '#ffcf5f');
  topLineGradient.addColorStop(1, '#ff6d93');
  ctx.fillStyle = topLineGradient;
  drawRoundedRect(ctx, x, y, width, 2, 2);
  ctx.fill();

  const cellGap = 8;
  const cellPadding = 12;
  const cellWidth = (width - cellPadding * 2 - cellGap * 2) / 3;
  const cellTop = y + 10;
  const cellHeight = 42;
  const labels = ['COMBO', 'PROGRESS', 'ACCURACY'];
  const values = [
    String(score.combo),
    `${(progress * 100).toFixed(1)}%`,
    `${accuracy.toFixed(2)}%`,
  ];

  for (let i = 0; i < 3; i += 1) {
    const cellLeft = x + cellPadding + i * (cellWidth + cellGap);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    drawRoundedRect(ctx, cellLeft, cellTop, cellWidth, cellHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(236, 246, 255, 0.58)';
    ctx.font = '700 10px Bahnschrift, Rajdhani, sans-serif';
    ctx.fillText(labels[i], cellLeft + cellWidth / 2, cellTop + 13);
    ctx.fillStyle = 'rgba(246, 251, 255, 0.96)';
    ctx.font = '700 18px Bahnschrift, Consolas, monospace';
    if (mode === 'new-full') {
      ctx.shadowColor = 'rgba(119, 255, 214, 0.16)';
      ctx.shadowBlur = 8;
    }
    ctx.fillText(values[i], cellLeft + cellWidth / 2, cellTop + 30);
    ctx.shadowBlur = 0;
  }

  const trackLeft = x + 12;
  const trackTop = y + height - 13;
  const trackWidth = width - 24;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  drawRoundedRect(ctx, trackLeft, trackTop, trackWidth, 5, 999);
  ctx.fill();
  const fillGradient = ctx.createLinearGradient(trackLeft, trackTop, trackLeft + trackWidth, trackTop);
  fillGradient.addColorStop(0, '#68f4d5');
  fillGradient.addColorStop(0.35, '#d3ff78');
  fillGradient.addColorStop(0.7, '#ffad66');
  fillGradient.addColorStop(1, '#ff6d93');
  ctx.fillStyle = fillGradient;
  drawRoundedRect(ctx, trackLeft, trackTop, trackWidth * progress, 5, 999);
  ctx.fill();
  ctx.restore();
};

export const GameplayHudCanvas: React.FC<GameplayHudCanvasProps> = ({
  active,
  visible,
  hudRevision: _hudRevision,
  effectsRevision: _effectsRevision,
  judgeFeedbackTop,
  judgeFeedbacksRef,
  keyEffectsRef,
  pressedKeysRef,
  currentTimeRef,
  scoreRuntimeRef,
  laneKeyLabels,
  playfieldGeometry,
  playfieldTopOffset = 0,
  gameplayHudMode,
  durationMs,
  opacity = 1,
}) => {
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const visibleRef = useRef(visible);
  const activeRef = useRef(active);
  const judgeFeedbackTopRef = useRef(judgeFeedbackTop);
  const playfieldGeometryRef = useRef(playfieldGeometry);
  const gameplayHudModeRef = useRef(gameplayHudMode);
  const laneKeyLabelsRef = useRef(laneKeyLabels);
  const durationMsRef = useRef(durationMs);
  const lastStaticSignatureRef = useRef('');
  const lastEffectsActiveRef = useRef(false);
  const shouldRenderHud = gameplayHudMode !== 'legacy';
  const canvasHeight = playfieldGeometry.slotHudEnabled
    ? Math.max(
        GAME_VIEW_HEIGHT,
        playfieldGeometry.keyLaneY + KEY_LANE_HEIGHT + SLOT_HUD_GAP + SLOT_HUD_HEIGHT
      )
    : GAME_VIEW_HEIGHT;
  const canvasTotalHeight = canvasHeight + playfieldTopOffset;

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
    durationMsRef.current = durationMs;
  }, [durationMs]);

  useEffect(() => {
    const canvases = [staticCanvasRef.current, effectsCanvasRef.current];
    const dpr = Math.min(window.devicePixelRatio || 1, GAMEPLAY_HUD_CANVAS_DPR_LIMIT);
    for (const canvas of canvases) {
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) continue;
      canvas.width = Math.round(GAME_VIEW_WIDTH * dpr);
      canvas.height = Math.round(canvasTotalHeight * dpr);
      canvas.style.width = `${GAME_VIEW_WIDTH}px`;
      canvas.style.height = `${canvasTotalHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, [canvasHeight, canvasTotalHeight]);

  useEffect(() => {
    const staticCanvas = staticCanvasRef.current;
    const effectsCanvas = effectsCanvasRef.current;
    const staticCtx = staticCanvas?.getContext('2d');
    const effectsCtx = effectsCanvas?.getContext('2d');
    if (!staticCanvas || !effectsCanvas || !staticCtx || !effectsCtx) return;

    const makeStaticSignature = () => {
      if (!visibleRef.current || !activeRef.current || !shouldRenderHud) return 'inactive';
      const geometry = playfieldGeometryRef.current;
      const score = scoreRuntimeRef.current;
      const progressBucket =
        geometry.slotHudEnabled && durationMsRef.current > 0
          ? Math.floor(Math.max(0, currentTimeRef.current) / SLOT_PROGRESS_PAINT_STEP_MS)
          : 0;
      return [
        gameplayHudModeRef.current,
        getPressedLaneMask(pressedKeysRef.current),
        score.combo,
        score.perfect,
        score.great,
        score.good,
        score.miss,
        progressBucket,
        geometry.slotHudEnabled ? 1 : 0,
        Math.round(geometry.keyLaneOpacity * 1000),
        Math.round(geometry.slotHudOpacity * 1000),
        Math.round(geometry.comboOpacity * 1000),
        geometry.keyPressGlowEnabled ? 1 : 0,
        geometry.keyPressPulseEnabled ? 1 : 0,
      ].join(':');
    };

    const renderStaticHud = () => {
      staticCtx.clearRect(0, 0, GAME_VIEW_WIDTH, canvasTotalHeight);
      if (!visibleRef.current || !activeRef.current || !shouldRenderHud) return;

      const geometry = playfieldGeometryRef.current;
      const hudMode = gameplayHudModeRef.current === 'new-full' ? 'new-full' : 'new-lite';
      staticCtx.save();
      staticCtx.translate(0, playfieldTopOffset);
      geometry.laneCenters.forEach((x, index) => {
        drawKeyLane(
          staticCtx,
          x,
          geometry.keyLaneY,
          geometry.laneWidth,
          laneKeyLabelsRef.current[index] ?? [],
          pressedKeysRef.current.has(index as Lane),
          geometry.keyLaneOpacity,
          hudMode,
          geometry.keyPressGlowEnabled,
          geometry.keyPressPulseEnabled,
          playfieldTopOffset
        );
      });
      drawCombo(
        staticCtx,
        scoreRuntimeRef.current.combo,
        geometry.laneGroupLeft + geometry.laneGroupWidth / 2,
        geometry.comboOpacity,
        hudMode
      );
      drawSlotHud(
        staticCtx,
        geometry,
        scoreRuntimeRef.current,
        currentTimeRef.current,
        durationMsRef.current,
        hudMode
      );
      staticCtx.restore();
    };

    const renderFrame = () => {
      const now = Date.now();
      const hudMode = gameplayHudModeRef.current === 'new-full' ? 'new-full' : 'new-lite';
      const staticSignature = makeStaticSignature();
      if (staticSignature !== lastStaticSignatureRef.current) {
        lastStaticSignatureRef.current = staticSignature;
        renderStaticHud();
      }

      let hasActiveEffect = false;
      if (visibleRef.current) {
        for (const effect of keyEffectsRef.current) {
          if (getKeyEffectProgress(effect, now) < 1) {
            hasActiveEffect = true;
            break;
          }
        }

        if (!hasActiveEffect) {
          for (const feedback of judgeFeedbacksRef.current) {
            if (getJudgeProgress(feedback, now) < 1) {
              hasActiveEffect = true;
              break;
            }
          }
        }
      }

      if (hasActiveEffect || lastEffectsActiveRef.current) {
        effectsCtx.clearRect(0, 0, GAME_VIEW_WIDTH, canvasTotalHeight);
        if (visibleRef.current) {
          effectsCtx.save();
          effectsCtx.translate(0, playfieldTopOffset);
          for (const effect of keyEffectsRef.current) {
            if (getKeyEffectProgress(effect, now) < 1) {
              drawKeyEffect(effectsCtx, effect, now, hudMode);
            }
          }

          for (const feedback of judgeFeedbacksRef.current) {
            if (getJudgeProgress(feedback, now) < 1) {
              drawJudgeFeedback(effectsCtx, feedback, now, judgeFeedbackTopRef.current, hudMode);
              drawLaneTimingFeedback(effectsCtx, feedback, now, hudMode);
            }
          }
          effectsCtx.restore();
        }
      }
      lastEffectsActiveRef.current = hasActiveEffect;

      frameIdRef.current = requestAnimationFrame(renderFrame);
    };

    if (!visible || !shouldRenderHud) {
      staticCtx.clearRect(0, 0, GAME_VIEW_WIDTH, canvasTotalHeight);
      effectsCtx.clearRect(0, 0, GAME_VIEW_WIDTH, canvasTotalHeight);
      frameIdRef.current = null;
      return;
    }

    lastStaticSignatureRef.current = '';
    lastEffectsActiveRef.current = false;
    frameIdRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [
    canvasHeight,
    canvasTotalHeight,
    playfieldTopOffset,
    currentTimeRef,
    judgeFeedbacksRef,
    keyEffectsRef,
    pressedKeysRef,
    scoreRuntimeRef,
    shouldRenderHud,
    active,
    visible,
    playfieldGeometry.slotHudEnabled,
  ]);

  return (
    <>
      <canvas
        ref={effectsCanvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: `${-playfieldTopOffset}px`,
          width: `${GAME_VIEW_WIDTH}px`,
          height: `${canvasTotalHeight}px`,
          pointerEvents: 'none',
          zIndex: 500,
          opacity,
        }}
      />
      <canvas
        ref={staticCanvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: `${-playfieldTopOffset}px`,
          width: `${GAME_VIEW_WIDTH}px`,
          height: `${canvasTotalHeight}px`,
          pointerEvents: 'none',
          zIndex: 501,
          opacity,
        }}
      />
    </>
  );
};
