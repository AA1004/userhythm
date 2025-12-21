import { useState, useCallback } from 'react';
import { BgaVisibilityInterval, BgaVisibilityMode } from '../types/game';

export interface UseBgaIntervalsOptions {
  /** 시간을 클램핑하는 함수 */
  clampTime: (time: number) => number;
}

export interface UseBgaIntervalsReturn {
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  setBgaVisibilityIntervals: React.Dispatch<React.SetStateAction<BgaVisibilityInterval[]>>;
  handleAddBgaInterval: (currentTime: number) => void;
  handleUpdateBgaInterval: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  handleDeleteBgaInterval: (id: string) => void;
  restoreBgaIntervals: (data: any[]) => void;
  resetBgaIntervals: () => void;
}

export function useBgaIntervals(options: UseBgaIntervalsOptions): UseBgaIntervalsReturn {
  const { clampTime } = options;

  const [bgaVisibilityIntervals, setBgaVisibilityIntervals] = useState<BgaVisibilityInterval[]>([]);

  const normalizeInterval = useCallback(
    (raw: Partial<BgaVisibilityInterval> & { id: string }): BgaVisibilityInterval => {
      const start = clampTime(Math.max(0, raw.startTimeMs ?? 0));
      const end = clampTime(Math.max(start + 1, raw.endTimeMs ?? start + 1));
      return {
        id: raw.id,
        startTimeMs: Math.min(start, end),
        endTimeMs: Math.max(start, end),
        mode: (raw.mode as BgaVisibilityMode) ?? 'hidden',
        fadeInMs: raw.fadeInMs !== undefined ? Math.max(0, Number(raw.fadeInMs)) : undefined,
        fadeOutMs: raw.fadeOutMs !== undefined ? Math.max(0, Number(raw.fadeOutMs)) : undefined,
        easing: raw.easing === 'linear' ? 'linear' : undefined,
      };
    },
    [clampTime]
  );

  const handleAddBgaInterval = useCallback((currentTime: number) => {
    const start = clampTime(currentTime);
    const end = clampTime(start + 5000);
    const next: BgaVisibilityInterval = normalizeInterval({
      id: `bga-${Date.now()}`,
      startTimeMs: start,
      endTimeMs: end,
      mode: 'hidden',
      fadeInMs: 300,
      fadeOutMs: 300,
      easing: 'linear',
    });
    setBgaVisibilityIntervals((prev) =>
      [...prev, next].sort((a, b) => a.startTimeMs - b.startTimeMs)
    );
  }, [clampTime, normalizeInterval]);

  const handleUpdateBgaInterval = useCallback(
    (id: string, patch: Partial<BgaVisibilityInterval>) => {
      setBgaVisibilityIntervals((prev) =>
        prev
          .map((interval) =>
            interval.id === id ? normalizeInterval({ ...interval, ...patch, id }) : interval
          )
          .sort((a, b) => a.startTimeMs - b.startTimeMs)
      );
    },
    [normalizeInterval]
  );

  const handleDeleteBgaInterval = useCallback((id: string) => {
    if (!confirm('이 간주 구간을 삭제할까요?')) return;
    setBgaVisibilityIntervals((prev) => prev.filter((interval) => interval.id !== id));
  }, []);

  const restoreBgaIntervals = useCallback((data: any[]) => {
    const hydrated: BgaVisibilityInterval[] = data.map((interval: any, idx: number) => ({
      id: typeof interval.id === 'string' ? interval.id : `bga-${idx}`,
      startTimeMs: Math.max(0, Number(interval.startTimeMs) || 0),
      endTimeMs: Math.max(0, Number(interval.endTimeMs) || 0),
      mode: (interval.mode as BgaVisibilityMode) ?? 'hidden',
      fadeInMs:
        interval.fadeInMs === undefined
          ? undefined
          : Math.max(0, Number(interval.fadeInMs) || 0),
      fadeOutMs:
        interval.fadeOutMs === undefined
          ? undefined
          : Math.max(0, Number(interval.fadeOutMs) || 0),
      easing: interval.easing === 'linear' ? ('linear' as const) : undefined,
    }));
    setBgaVisibilityIntervals(hydrated);
  }, []);

  const resetBgaIntervals = useCallback(() => {
    setBgaVisibilityIntervals([]);
  }, []);

  return {
    bgaVisibilityIntervals,
    setBgaVisibilityIntervals,
    handleAddBgaInterval,
    handleUpdateBgaInterval,
    handleDeleteBgaInterval,
    restoreBgaIntervals,
    resetBgaIntervals,
  };
}
