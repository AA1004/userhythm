import { BgaVisibilityInterval, BgaVisibilityMode } from '../types/game';

export interface BgaVisibilitySegment {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  fadeInMs: number;
  fadeOutMs: number;
}

const clampMs = (value: number, maxTimeMs?: number) => {
  const finiteValue = Number.isFinite(value) ? value : 0;
  const minClamped = Math.max(0, finiteValue);
  return typeof maxTimeMs === 'number' ? Math.min(minClamped, maxTimeMs) : minClamped;
};

export function getBgaEventFadeInMs(event: BgaVisibilityInterval): number {
  return event.mode === 'hidden' ? Math.max(0, Number(event.fadeInMs) || 0) : 0;
}

export function getBgaEventFadeOutMs(event: BgaVisibilityInterval): number {
  return event.mode === 'visible' ? Math.max(0, Number(event.fadeOutMs) || 0) : 0;
}

export function normalizeBgaVisibilityEvents(
  events: BgaVisibilityInterval[],
  maxTimeMs?: number
): BgaVisibilityInterval[] {
  return events
    .map((event) => {
      const mode: BgaVisibilityMode = event.mode === 'visible' ? 'visible' : 'hidden';
      const startTimeMs = clampMs(Number(event.startTimeMs) || 0, maxTimeMs);
      const easing: 'linear' | undefined = event.easing === 'linear' ? 'linear' : undefined;
      return {
        ...event,
        mode,
        startTimeMs,
        // Hide/Show are timeline events. endTimeMs is kept for backward schema compatibility only.
        endTimeMs: startTimeMs,
        fadeInMs: mode === 'hidden' ? Math.max(0, Number(event.fadeInMs) || 0) : 0,
        fadeOutMs: mode === 'visible' ? Math.max(0, Number(event.fadeOutMs) || 0) : 0,
        easing,
      };
    })
    .sort((a, b) => {
      if (a.startTimeMs !== b.startTimeMs) return a.startTimeMs - b.startTimeMs;
      if (a.mode === b.mode) return a.id.localeCompare(b.id);
      return a.mode === 'hidden' ? -1 : 1;
    });
}

export function expandLegacyBgaVisibilityIntervals(
  intervals: BgaVisibilityInterval[],
  maxTimeMs?: number
): BgaVisibilityInterval[] {
  const events: BgaVisibilityInterval[] = [];

  for (const interval of intervals) {
    const mode: BgaVisibilityMode = interval.mode === 'visible' ? 'visible' : 'hidden';
    const startTimeMs = clampMs(Number(interval.startTimeMs) || 0, maxTimeMs);
    const rawEnd = Number(interval.endTimeMs);
    const endTimeMs = clampMs(Number.isFinite(rawEnd) ? rawEnd : startTimeMs, maxTimeMs);
    const hasLegacyLength = endTimeMs > startTimeMs + 1;

    const easing: 'linear' | undefined = interval.easing === 'linear' ? 'linear' : undefined;

    events.push({
      ...interval,
      id: interval.id,
      startTimeMs,
      endTimeMs: startTimeMs,
      mode,
      fadeInMs: mode === 'hidden' ? Math.max(0, Number(interval.fadeInMs) || 0) : 0,
      fadeOutMs: mode === 'visible' ? Math.max(0, Number(interval.fadeOutMs) || 0) : 0,
      easing,
    });

    if (hasLegacyLength && mode === 'hidden') {
      events.push({
        ...interval,
        id: `${interval.id}-show`,
        startTimeMs: endTimeMs,
        endTimeMs,
        mode: 'visible',
        fadeInMs: 0,
        fadeOutMs: Math.max(0, Number(interval.fadeOutMs) || 0),
        easing,
      });
    }
  }

  return normalizeBgaVisibilityEvents(events, maxTimeMs);
}

export function buildBgaVisibilitySegments(
  events: BgaVisibilityInterval[],
  maxTimeMs = Number.POSITIVE_INFINITY
): BgaVisibilitySegment[] {
  const maxTime = Number.isFinite(maxTimeMs) ? maxTimeMs : undefined;
  const editableSegments = events
    .filter((event) => {
      const startTimeMs = clampMs(Number(event.startTimeMs) || 0, maxTime);
      const rawEnd = Number(event.endTimeMs);
      const endTimeMs = clampMs(Number.isFinite(rawEnd) ? rawEnd : startTimeMs, maxTime);
      return event.mode !== 'visible' && endTimeMs > startTimeMs + 1;
    })
    .map((event): BgaVisibilitySegment => {
      const startTimeMs = clampMs(Number(event.startTimeMs) || 0, maxTime);
      const rawEnd = Number(event.endTimeMs);
      const endTimeMs = clampMs(Number.isFinite(rawEnd) ? rawEnd : startTimeMs, maxTime);
      return {
        id: event.id,
        startTimeMs,
        endTimeMs,
        fadeInMs: Math.max(0, Number(event.fadeInMs) || 0),
        fadeOutMs: Math.max(0, Number(event.fadeOutMs) || 0),
      };
    });

  const eventLikeIntervals = events.filter((event) => {
    const startTimeMs = clampMs(Number(event.startTimeMs) || 0, maxTime);
    const rawEnd = Number(event.endTimeMs);
    const endTimeMs = clampMs(Number.isFinite(rawEnd) ? rawEnd : startTimeMs, maxTime);
    return event.mode === 'visible' || endTimeMs <= startTimeMs + 1;
  });

  const normalized = expandLegacyBgaVisibilityIntervals(eventLikeIntervals, maxTime);
  const segments: BgaVisibilitySegment[] = [];
  let activeHide: BgaVisibilityInterval | null = null;

  for (const event of normalized) {
    if (event.mode === 'hidden') {
      activeHide = event;
      continue;
    }

    if (!activeHide) {
      continue;
    }

    const endTimeMs = Math.max(activeHide.startTimeMs, event.startTimeMs);
    segments.push({
      id: activeHide.id,
      startTimeMs: activeHide.startTimeMs,
      endTimeMs,
      fadeInMs: getBgaEventFadeInMs(activeHide),
      fadeOutMs: getBgaEventFadeOutMs(event),
    });
    activeHide = null;
  }

  if (activeHide) {
    segments.push({
      id: activeHide.id,
      startTimeMs: activeHide.startTimeMs,
      endTimeMs: maxTimeMs,
      fadeInMs: getBgaEventFadeInMs(activeHide),
      fadeOutMs: 0,
    });
  }

  return [...editableSegments, ...segments].sort((a, b) => a.startTimeMs - b.startTimeMs);
}

export function convertBgaEventsToEditableIntervals(
  events: BgaVisibilityInterval[],
  maxTimeMs = Number.POSITIVE_INFINITY
): BgaVisibilityInterval[] {
  return buildBgaVisibilitySegments(events, maxTimeMs).map((segment) => ({
    id: segment.id,
    startTimeMs: segment.startTimeMs,
    endTimeMs: segment.endTimeMs,
    mode: 'hidden' as const,
    fadeInMs: segment.fadeInMs,
    fadeOutMs: segment.fadeOutMs,
    easing: 'linear' as const,
  }));
}

export function normalizeBgaIntervalsForRuntime(
  intervals: BgaVisibilityInterval[],
  maxTimeMs: number
): BgaVisibilityInterval[] {
  return intervals
    .map((interval) => {
      const startTimeMs = Math.max(0, Number(interval.startTimeMs) || 0);
      const endTimeMs = Math.max(0, Number(interval.endTimeMs) || 0);

      // A hide interval that reaches the playable duration should stay as a
      // finite hidden segment. Collapsing it into a point-like hide event makes
      // useBgaMask interpret it as "hidden forever" because runtime mask
      // calculation does not receive maxTimeMs.
      if (interval.mode !== 'visible' && endTimeMs >= maxTimeMs) {
        return {
          ...interval,
          startTimeMs,
          endTimeMs: Math.max(startTimeMs, maxTimeMs),
          mode: 'hidden' as const,
          fadeOutMs: 0,
        };
      }

      return {
        ...interval,
        startTimeMs,
        endTimeMs,
      };
    })
    .sort((a, b) => a.startTimeMs - b.startTimeMs);
}
