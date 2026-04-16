import { useState, useMemo, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { BgaVisibilityInterval } from '../types/game';
import { buildBgaVisibilitySegments } from '../utils/bgaVisibility';

export interface UseBgaMaskOptions {
  currentTime: number;
  currentTimeRef?: MutableRefObject<number>;
  currentTimeOffsetMs?: number;
}

export interface UseBgaMaskReturn {
  intervals: BgaVisibilityInterval[];
  setIntervals: (intervals: BgaVisibilityInterval[]) => void;
  maskOpacity: number;
  isLaneUiVisible: boolean;
}

export function useBgaMask({
  currentTime,
  currentTimeRef,
  currentTimeOffsetMs = 0,
}: UseBgaMaskOptions): UseBgaMaskReturn {
  const [intervals, setIntervals] = useState<BgaVisibilityInterval[]>([]);
  const [realtimeLaneUiVisible, setRealtimeLaneUiVisible] = useState(true);
  const realtimeLaneUiVisibleRef = useRef(true);

  const hiddenSegments = useMemo(
    () => buildBgaVisibilitySegments(intervals),
    [intervals]
  );

  const getBgaMaskOpacity = useCallback(
    (chartTimeMs: number) => {
      let maxOpacity = 0;

      for (const segment of hiddenSegments) {
        const fadeIn = Math.max(0, segment.fadeInMs);
        const fadeOut = Math.max(0, segment.fadeOutMs);
        const fadeOutEnd = segment.endTimeMs + fadeOut;
        if (segment.startTimeMs > chartTimeMs) break;
        if (chartTimeMs > fadeOutEnd) continue;

        if (fadeIn > 0 && chartTimeMs < segment.startTimeMs + fadeIn) {
          const t = (chartTimeMs - segment.startTimeMs) / Math.max(1, fadeIn);
          maxOpacity = Math.max(maxOpacity, Math.max(0, Math.min(1, t)));
          continue;
        }

        if (fadeOut > 0 && chartTimeMs >= segment.endTimeMs) {
          const t = 1 - (chartTimeMs - segment.endTimeMs) / Math.max(1, fadeOut);
          maxOpacity = Math.max(maxOpacity, Math.max(0, Math.min(1, t)));
          continue;
        }

        if (chartTimeMs >= segment.startTimeMs && chartTimeMs < segment.endTimeMs) {
          maxOpacity = 1;
        }
      }

      return maxOpacity;
    },
    [hiddenSegments]
  );

  const getLaneUiVisible = useCallback(
    (chartTimeMs: number) => {
      for (const segment of hiddenSegments) {
        if (segment.startTimeMs > chartTimeMs) break;
        if (chartTimeMs >= segment.startTimeMs && chartTimeMs < segment.endTimeMs) {
          return false;
        }
      }
      return true;
    },
    [hiddenSegments]
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

  const derivedLaneUiVisible = useMemo(
    () => getLaneUiVisible(currentTime),
    [currentTimeBucket, getLaneUiVisible]
  );

  useEffect(() => {
    realtimeLaneUiVisibleRef.current = derivedLaneUiVisible;
    setRealtimeLaneUiVisible(derivedLaneUiVisible);
  }, [derivedLaneUiVisible]);

  useEffect(() => {
    if (!currentTimeRef) return;

    let frameId: number | null = null;

    const tick = () => {
      const next = getLaneUiVisible(currentTimeRef.current + currentTimeOffsetMs);
      if (realtimeLaneUiVisibleRef.current !== next) {
        realtimeLaneUiVisibleRef.current = next;
        setRealtimeLaneUiVisible(next);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [currentTimeRef, currentTimeOffsetMs, getLaneUiVisible]);

  return {
    intervals,
    setIntervals,
    maskOpacity,
    isLaneUiVisible: realtimeLaneUiVisible,
  };
}

