import { LanePositionInterval } from '../types/game';

export const DEFAULT_LANE_POSITION_DURATION_MS = 4000;
export const LANE_POSITION_PRESET_OFFSET = 150;
export const MAX_LANE_POSITION_OFFSET = 220;

export function normalizeLanePositionIntervals(
  intervals: LanePositionInterval[],
  maxTimeMs: number = Number.POSITIVE_INFINITY
): LanePositionInterval[] {
  const maxTime = Number.isFinite(maxTimeMs) ? Math.max(0, maxTimeMs) : Number.POSITIVE_INFINITY;
  const sorted = intervals
    .map((interval, index): LanePositionInterval => {
      const start = Math.max(0, Number(interval.startTimeMs) || 0);
      const rawEnd = Number(interval.endTimeMs);
      const end = Math.max(start, Number.isFinite(rawEnd) ? rawEnd : start);
      return {
        id: typeof interval.id === 'string' && interval.id ? interval.id : `lane-pos-${index}`,
        startTimeMs: Math.min(start, maxTime),
        endTimeMs: Math.min(Math.max(start, end), maxTime),
        offsetX: Number.isFinite(Number(interval.offsetX))
          ? Math.max(-MAX_LANE_POSITION_OFFSET, Math.min(MAX_LANE_POSITION_OFFSET, Number(interval.offsetX)))
          : 0,
      };
    })
    .filter((interval) => interval.endTimeMs > interval.startTimeMs)
    .sort((a, b) => a.startTimeMs - b.startTimeMs || a.endTimeMs - b.endTimeMs);

  const normalized: LanePositionInterval[] = [];
  for (const interval of sorted) {
    const previous = normalized[normalized.length - 1];
    if (previous && interval.startTimeMs < previous.endTimeMs) {
      const shifted = {
        ...interval,
        startTimeMs: previous.endTimeMs,
        endTimeMs: Math.max(previous.endTimeMs, interval.endTimeMs),
      };
      if (shifted.endTimeMs > shifted.startTimeMs) {
        normalized.push(shifted);
      }
      continue;
    }
    normalized.push(interval);
  }
  return normalized;
}

export function getLanePositionOffsetAtTime(
  intervals: LanePositionInterval[],
  currentTimeMs: number
): number {
  if (!intervals.length) return 0;
  const time = Math.max(0, currentTimeMs);
  const active = intervals.find(
    (interval) => time >= interval.startTimeMs && time < interval.endTimeMs
  );
  return active ? active.offsetX : 0;
}
