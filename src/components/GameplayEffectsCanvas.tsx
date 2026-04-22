import React, { useEffect, useRef } from 'react';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';

interface GameplayEffectsCanvasProps {
  judgeFeedbacks: JudgeFeedback[];
  keyEffects: KeyEffect[];
  judgeFeedbackTop: number;
  visible: boolean;
}

const JUDGE_COLORS = {
  perfect: '#FFD700',
  great: '#00FF00',
  good: '#00BFFF',
  miss: '#FF4500',
} as const;

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const GameplayEffectsCanvas: React.FC<GameplayEffectsCanvasProps> = ({
  judgeFeedbacks,
  keyEffects,
  judgeFeedbackTop,
  visible,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const judgeFeedbacksRef = useRef(judgeFeedbacks);
  const keyEffectsRef = useRef(keyEffects);
  const judgeFeedbackTopRef = useRef(judgeFeedbackTop);
  const visibleRef = useRef(visible);

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

    const setupCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(GAME_VIEW_WIDTH * dpr);
      canvas.height = Math.round(GAME_VIEW_HEIGHT * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    setupCanvas();

    const render = () => {
      if (!visibleRef.current) {
        ctx.clearRect(0, 0, GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT);
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const now = Date.now();
      const feedbacks = judgeFeedbacksRef.current;
      const effects = keyEffectsRef.current;
      ctx.clearRect(0, 0, GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT);

      for (const effect of effects) {
        const age = Math.max(0, 1 - (effect.expiresAt - now) / 800);
        if (age >= 1) continue;
        const alpha = Math.max(0, 1 - age);
        const size = 18 + age * 42;
        const color = JUDGE_COLORS[effect.judge];

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(effect.x - size, effect.y - size);
        ctx.lineTo(effect.x + size, effect.y + size);
        ctx.moveTo(effect.x + size, effect.y - size);
        ctx.lineTo(effect.x - size, effect.y + size);
        ctx.stroke();
        ctx.restore();
      }

      for (const feedback of feedbacks) {
        const age = Math.max(0, 1 - (feedback.expiresAt - now) / 800);
        if (age >= 1) continue;
        const alpha = Math.max(0, 1 - age);
        const scale = 0.85 + easeOutBack(Math.min(1, age * 1.6)) * 0.18;
        const color = JUDGE_COLORS[feedback.judge];

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.font = `700 ${Math.round(48 * scale)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(feedback.judge.toUpperCase(), GAME_VIEW_WIDTH / 2, judgeFeedbackTopRef.current);
        ctx.restore();
      }

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1100,
      }}
    />
  );
};
