import { useState, useMemo, useCallback } from 'react';
import { BgaVisibilityInterval } from '../types/game';

export interface UseBgaMaskOptions {
  currentTime: number;
}

export interface UseBgaMaskReturn {
  intervals: BgaVisibilityInterval[];
  setIntervals: (intervals: BgaVisibilityInterval[]) => void;
  maskOpacity: number;
}

export function useBgaMask({ currentTime }: UseBgaMaskOptions): UseBgaMaskReturn {
  const [intervals, setIntervals] = useState<BgaVisibilityInterval[]>([]);

  const sortedIntervals = useMemo(
    () => [...intervals].sort((a, b) => a.startTimeMs - b.startTimeMs),
    [intervals]
  );

  const getBgaMaskOpacity = useCallback(
    (chartTimeMs: number) => {
      let maxOpacity = 0;

      for (const interval of sortedIntervals) {
        if (interval.startTimeMs > chartTimeMs) break;
        if (chartTimeMs > interval.endTimeMs) continue;
        const fadeIn = Math.max(0, interval.fadeInMs ?? 0);
        const fadeOut = Math.max(0, interval.fadeOutMs ?? 0);
        const toHidden = interval.mode === 'hidden';

        if (fadeIn > 0 && chartTimeMs < interval.startTimeMs + fadeIn) {
          const t = (chartTimeMs - interval.startTimeMs) / Math.max(1, fadeIn);
          const opacity = toHidden ? t : 1 - t;
          maxOpacity = Math.max(maxOpacity, opacity);
          continue;
        }

        if (fadeOut > 0 && chartTimeMs > interval.endTimeMs - fadeOut) {
          const t = (interval.endTimeMs - chartTimeMs) / Math.max(1, fadeOut);
          const clamped = Math.max(0, Math.min(1, t));
          const opacity = toHidden ? clamped : 1 - clamped;
          maxOpacity = Math.max(maxOpacity, opacity);
          continue;
        }

        const opacity = toHidden ? 1 : 0;
        maxOpacity = Math.max(maxOpacity, opacity);
      }

      return maxOpacity;
    },
    [sortedIntervals]
  );

  // currentTime을 30ms 단위로 버킷화하여 불필요한 재계산 방지
  const currentTimeBucket = useMemo(
    () => Math.round(currentTime / 30),
    [currentTime]
  );

  const maskOpacity = useMemo(
    () => getBgaMaskOpacity(currentTime),
    [currentTimeBucket, getBgaMaskOpacity]
  );

  return {
    intervals,
    setIntervals,
    maskOpacity,
  };
}

