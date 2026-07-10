import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { LanePositionInterval } from '../types/game';
import { getLanePositionOffsetAtTime } from '../utils/lanePositionIntervals';

const LANE_POSITION_CLOCK_INTERVAL_MS = 1000 / 30;

/** Lane offsets are piecewise constant, so only interval boundaries trigger React updates. */
export function useLanePositionOffset(
  intervals: LanePositionInterval[],
  currentTimeRef: MutableRefObject<number>,
  chartTimeOffsetMs: number,
  isActive: boolean
): number {
  const [offsetX, setOffsetX] = useState(0);
  const intervalsRef = useRef(intervals);
  const chartTimeOffsetRef = useRef(chartTimeOffsetMs);

  useEffect(() => {
    intervalsRef.current = intervals;
    chartTimeOffsetRef.current = chartTimeOffsetMs;
  }, [intervals, chartTimeOffsetMs]);

  useEffect(() => {
    if (!isActive) {
      setOffsetX(0);
      return;
    }

    const sync = () => {
      const nextOffset = getLanePositionOffsetAtTime(
        intervalsRef.current,
        currentTimeRef.current + chartTimeOffsetRef.current
      );
      setOffsetX((previous) => (previous === nextOffset ? previous : nextOffset));
    };

    sync();
    const intervalId = window.setInterval(sync, LANE_POSITION_CLOCK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [currentTimeRef, isActive]);

  return offsetX;
}
