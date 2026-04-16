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
  const normalized = expandLegacyBgaVisibilityIntervals(events, Number.isFinite(maxTimeMs) ? maxTimeMs : undefined);
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

  return segments;
}
