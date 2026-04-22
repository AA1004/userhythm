import React, { useEffect, useRef } from 'react';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import { JUDGE_FEEDBACK_DURATION_MS } from '../constants/gameConstants';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';
import { JudgeType } from '../types/game';

interface GameplayEffectsCanvasProps {
  judgeFeedbacks: JudgeFeedback[];
  keyEffects: KeyEffect[];
  judgeFeedbackTop: number;
  visible: boolean;
}

const KEY_EFFECT_DURATION_MS = 520;

const judgeColors: Record<JudgeType, { main: string; soft: string }> = {
  perfect: { main: '#FFD700', soft: 'rgba(255, 215, 0, 0.4)' },
  great: { main: '#00FF00', soft: 'rgba(0, 255, 0, 0.4)' },
  good: { main: '#00BFFF', soft: 'rgba(0, 191, 255, 0.4)' },
  miss: { main: '#FF4500', soft: 'rgba(255, 69, 0, 0.4)' },
};

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

const drawRoundedBar = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  softColor: string
) => {
  const gradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.22, color);
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.78, color);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.shadowColor = softColor;
  ctx.shadowBlur = 10;
  const radius = height / 2;
  ctx.beginPath();
  ctx.moveTo(-width / 2 + radius, -height / 2);
  ctx.lineTo(width / 2 - radius, -height / 2);
  ctx.quadraticCurveTo(width / 2, -height / 2, width / 2, 0);
  ctx.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
  ctx.lineTo(-width / 2 + radius, height / 2);
  ctx.quadraticCurveTo(-width / 2, height / 2, -width / 2, 0);
  ctx.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
};

const getKeyEffectProgress = (effect: KeyEffect, now: number) => {
  const startedAt = effect.expiresAt - JUDGE_FEEDBACK_DURATION_MS;
  return Math.max(0, Math.min(1, (now - startedAt) / KEY_EFFECT_DURATION_MS));
};

const getJudgeProgress = (feedback: JudgeFeedback, now: number) => {
  const startedAt = feedback.expiresAt - JUDGE_FEEDBACK_DURATION_MS;
  return Math.max(0, Math.min(1, (now - startedAt) / JUDGE_FEEDBACK_DURATION_MS));
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

  ctx.save();
  ctx.rotate(Math.PI / 4);
  drawRoundedBar(ctx, 92, 6, colors.main, colors.soft);
  ctx.restore();

  ctx.save();
  ctx.rotate(-Math.PI / 4);
  drawRoundedBar(ctx, 92, 6, colors.main, colors.soft);
  ctx.restore();

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

export const GameplayEffectsCanvas: React.FC<GameplayEffectsCanvasProps> = ({
  judgeFeedbacks,
  keyEffects,
  judgeFeedbackTop,
  visible,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const judgeFeedbacksRef = useRef(judgeFeedbacks);
  const keyEffectsRef = useRef(keyEffects);
  const judgeFeedbackTopRef = useRef(judgeFeedbackTop);
  const visibleRef = useRef(visible);
  const frameIdRef = useRef<number | null>(null);

  useEffect(() => {
    judgeFeedbacksRef.current = judgeFeedbacks;
  }, [judgeFeedbacks]);

  useEffect(() => {
    keyEffectsRef.current = keyEffects;
  }, [keyEffects]);

  useEffect(() => {
    judgeFeedbackTopRef.current = judgeFeedbackTop;
  }, [judgeFeedbackTop]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(GAME_VIEW_WIDTH * dpr);
    canvas.height = Math.round(GAME_VIEW_HEIGHT * dpr);
    canvas.style.width = `${GAME_VIEW_WIDTH}px`;
    canvas.style.height = `${GAME_VIEW_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }

    if (!visible || (judgeFeedbacks.length === 0 && keyEffects.length === 0)) {
      ctx.clearRect(0, 0, GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT);
      return;
    }

    let cancelled = false;
    const render = () => {
      ctx.clearRect(0, 0, GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT);
      const now = Date.now();
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
          }
        }
      }

      if (!cancelled && hasActiveEffect) {
        frameIdRef.current = requestAnimationFrame(render);
      } else {
        frameIdRef.current = null;
      }
    };

    frameIdRef.current = requestAnimationFrame(render);
    return () => {
      cancelled = true;
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [judgeFeedbacks, keyEffects, visible, judgeFeedbackTop]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${GAME_VIEW_WIDTH}px`,
        height: `${GAME_VIEW_HEIGHT}px`,
        pointerEvents: 'none',
        zIndex: 1001,
      }}
    />
  );
};
