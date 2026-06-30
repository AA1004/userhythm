import React, { useEffect, useRef } from 'react';

interface FpsHudProps {
  enabled?: boolean;
}

/**
 * FPS 측정 및 표시 컴포넌트
 * rAF 타임스탬프를 사용하여 실제 프레임레이트를 측정하고,
 * EMA(지수이동평균)로 스무딩하여 표시합니다.
 */
export const FpsHud: React.FC<FpsHudProps> = ({ enabled = true }) => {
  const hudRef = useRef<HTMLDivElement | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const smoothedFpsRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const samplesRef = useRef<Float32Array>(new Float32Array(480));
  const sampleCursorRef = useRef(0);
  const sampleCountRef = useRef(0);
  const maxFrameMsRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number>();

  // EMA 스무딩 계수 (0.1 = 최근 값에 10% 가중치)
  const EMA_ALPHA = 0.1;
  // HUD 업데이트 주기. 240Hz 플레이 중 정렬/DOM 갱신 비용을 낮추기 위해 2Hz로 제한.
  const UPDATE_INTERVAL_MS = 500;

  useEffect(() => {
    if (!enabled) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = undefined;
      }
      return;
    }

    const measureFrame = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
        lastUpdateTimeRef.current = timestamp;
        rafIdRef.current = requestAnimationFrame(measureFrame);
        return;
      }

      // 프레임 간 시간 차이 계산 (ms)
      const deltaTime = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      if (deltaTime > 0) {
        // instant FPS 계산
        const instantFps = 1000 / deltaTime;
        maxFrameMsRef.current = Math.max(maxFrameMsRef.current, deltaTime);
        samplesRef.current[sampleCursorRef.current] = instantFps;
        sampleCursorRef.current = (sampleCursorRef.current + 1) % samplesRef.current.length;
        sampleCountRef.current = Math.min(sampleCountRef.current + 1, samplesRef.current.length);
        
        // EMA로 스무딩
        smoothedFpsRef.current = smoothedFpsRef.current === 0
          ? instantFps
          : EMA_ALPHA * instantFps + (1 - EMA_ALPHA) * smoothedFpsRef.current;
        
        frameCountRef.current++;
      }

      // 주기적으로만 setState로 업데이트 (과도한 리렌더 방지)
      const timeSinceLastUpdate = timestamp - lastUpdateTimeRef.current;
      if (timeSinceLastUpdate >= UPDATE_INTERVAL_MS) {
        const sampleCount = sampleCountRef.current;
        if (sampleCount > 0) {
          const samples = Array.from(samplesRef.current.subarray(0, sampleCount)).sort((a, b) => a - b);
          const lowIndex = Math.max(0, Math.floor(sampleCount * 0.01));
          const fps = Math.round(smoothedFpsRef.current);
          const minFps = Math.round(samples[0]);
          const lowFps = Math.round(samples[lowIndex]);
          const spikeMs = Math.round(maxFrameMsRef.current);
          if (hudRef.current) {
            hudRef.current.textContent = `${fps} FPS | min ${minFps} | 1% ${lowFps} | spike ${spikeMs}ms`;
            hudRef.current.style.color = getFpsColor(fps);
          }
        }
        maxFrameMsRef.current = 0;
        lastUpdateTimeRef.current = timestamp;
      }

      rafIdRef.current = requestAnimationFrame(measureFrame);
    };

    rafIdRef.current = requestAnimationFrame(measureFrame);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = undefined;
      }
      lastFrameTimeRef.current = 0;
      smoothedFpsRef.current = 0;
      frameCountRef.current = 0;
      samplesRef.current = new Float32Array(480);
      sampleCursorRef.current = 0;
      sampleCountRef.current = 0;
      maxFrameMsRef.current = 0;
    };
  }, [enabled]);

  if (!enabled) return null;

  // FPS HUD must not trigger React commits during gameplay.
  const getFpsColor = (fps: number) => {
    if (fps >= 150) return '#00ff00'; // 녹색 (165Hz 목표)
    if (fps >= 120) return '#90ee90'; // 연한 녹색
    if (fps >= 60) return '#ffff00'; // 노란색
    if (fps >= 30) return '#ffa500'; // 주황색
    return '#ff0000'; // 빨간색
  };

  return (
    <div
      ref={hudRef}
      className="fps-hud"
      style={{
        position: 'fixed',
        top: '8px',
        left: '8px',
        padding: '4px 8px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: '#00ff00',
        fontSize: '14px',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        borderRadius: '4px',
        zIndex: 10000,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      0 FPS | min 0 | 1% 0 | spike 0ms
    </div>
  );
};

