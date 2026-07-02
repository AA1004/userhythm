import { useState, useCallback, useMemo, useRef, useEffect, type MutableRefObject } from 'react';
import { SubtitleCue, SubtitleStyle, ensureSubtitleFontsReady } from '../types/subtitle';
import { subtitleAPI, localSubtitleStorage } from '../lib/subtitleAPI';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { GameState } from '../types/game';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { getSubtitleFontKey, normalizeSubtitlePayload } from '../utils/subtitleNormalization';

export interface ActiveSubtitle {
  cue: SubtitleCue;
  opacity: number;
}

export interface UseSubtitlesReturn {
  subtitles: SubtitleCue[];
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleCue[]>>;
  loadSubtitlesForChart: (chartId: string | string[] | undefined) => Promise<void>;
  getSubtitleOpacity: (cue: SubtitleCue, chartTimeMs: number) => number;
  activeSubtitles: ActiveSubtitle[];
}

interface SubtitleTimelineEntry {
  cue: SubtitleCue;
  originalIndex: number;
  startTimeMs: number;
  effectiveEndTimeMs: number;
}

interface SubtitleTimelineIndex {
  byStart: SubtitleTimelineEntry[];
  byEnd: SubtitleTimelineEntry[];
}

const SUBTITLE_ACTIVE_BUCKET_MS = 120;
const SUBTITLE_IDLE_LOOKAHEAD_MS = 250;
const SUBTITLE_MAX_IDLE_SLEEP_MS = 1000;

const getSubtitleEffectiveEndTime = (cue: SubtitleCue): number => {
  const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
  const outEffect = style.outEffect ?? 'none';
  const outDuration = style.outDurationMs ?? 120;
  return cue.endTimeMs + (outEffect === 'fade' ? Math.max(0, outDuration) : 0);
};

const sortSubtitles = (cues: SubtitleCue[]): SubtitleCue[] =>
  [...cues].sort((a, b) => a.startTimeMs - b.startTimeMs || a.endTimeMs - b.endTimeMs);

const getSubtitleStateKey = (cues: SubtitleCue[]): string =>
  cues
    .map((cue) => `${cue.id}:${cue.trackId ?? cue.style?.trackId ?? ''}:${cue.startTimeMs}:${cue.endTimeMs}:${cue.text}:${JSON.stringify(cue.style ?? {})}`)
    .join('|');

const prepareSubtitleFonts = (cues: SubtitleCue[], lastFontKeyRef: MutableRefObject<string>) => {
  if (!cues.length) return;
  const fontKey = getSubtitleFontKey(cues);
  if (lastFontKeyRef.current === fontKey) return;
  lastFontKeyRef.current = fontKey;
  void ensureSubtitleFontsReady(
    cues.map((cue) => cue.style?.fontFamily || 'Noto Sans KR, sans-serif')
  ).catch((error) => {
    console.warn('Subtitle font preparation failed:', error);
  });
};

const upperBoundStarted = (entries: SubtitleTimelineEntry[], timeMs: number): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (entries[mid].startTimeMs <= timeMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

const lowerBoundNotEnded = (entries: SubtitleTimelineEntry[], timeMs: number): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (entries[mid].effectiveEndTimeMs < timeMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

const getNextSubtitleWakeDelay = (
  index: SubtitleTimelineIndex,
  timeMs: number
): number => {
  const { byStart, byEnd } = index;
  const startedCount = upperBoundStarted(byStart, timeMs);
  const firstNotEndedIndex = lowerBoundNotEnded(byEnd, timeMs);

  if (startedCount > firstNotEndedIndex) {
    return SUBTITLE_ACTIVE_BUCKET_MS;
  }

  const nextStart = byStart[startedCount]?.startTimeMs;
  if (typeof nextStart !== 'number') {
    return SUBTITLE_MAX_IDLE_SLEEP_MS;
  }

  const delayToNextStart = nextStart - timeMs - SUBTITLE_IDLE_LOOKAHEAD_MS;
  if (delayToNextStart <= SUBTITLE_ACTIVE_BUCKET_MS) {
    return SUBTITLE_ACTIVE_BUCKET_MS;
  }

  return Math.min(SUBTITLE_MAX_IDLE_SLEEP_MS, delayToNextStart);
};

export function useSubtitles(
  gameState: GameState,
  currentChartTimeMs: number,
  currentTimeRef?: MutableRefObject<number>,
  currentTimeOffsetMs = 0
): UseSubtitlesReturn {
  const [subtitles, setSubtitlesState] = useState<SubtitleCue[]>([]);
  const [subtitleClockSourceMs, setSubtitleClockSourceMs] = useState(currentChartTimeMs);
  const lastSubtitleStateKeyRef = useRef('');
  const lastFontKeyRef = useRef('');
  const subtitleClockTimeMs = useMemo(
    () => Math.floor(subtitleClockSourceMs / SUBTITLE_ACTIVE_BUCKET_MS) * SUBTITLE_ACTIVE_BUCKET_MS,
    [subtitleClockSourceMs]
  );

  const timelineIndex = useMemo<SubtitleTimelineIndex>(() => {
    const byStart = subtitles.map((cue, originalIndex) => ({
      cue,
      originalIndex,
      startTimeMs: cue.startTimeMs,
      effectiveEndTimeMs: getSubtitleEffectiveEndTime(cue),
    }));
    const byEnd = [...byStart].sort(
      (a, b) => a.effectiveEndTimeMs - b.effectiveEndTimeMs || a.startTimeMs - b.startTimeMs
    );
    return { byStart, byEnd };
  }, [subtitles]);

  useEffect(() => {
    if (!currentTimeRef || !gameState.gameStarted || gameState.gameEnded || !subtitles.length) {
      setSubtitleClockSourceMs(currentChartTimeMs);
      return;
    }

    let timerId: number | null = null;
    let lastBucket = Number.NaN;
    const tick = () => {
      const nextTime = Math.max(0, currentTimeRef.current + currentTimeOffsetMs);
      const nextBucket = Math.floor(nextTime / SUBTITLE_ACTIVE_BUCKET_MS);
      if (nextBucket !== lastBucket) {
        lastBucket = nextBucket;
        setSubtitleClockSourceMs(nextTime);
      }
      timerId = window.setTimeout(
        tick,
        getNextSubtitleWakeDelay(timelineIndex, nextTime)
      );
    };

    timerId = window.setTimeout(tick, 0);
    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [
    currentTimeRef,
    currentTimeOffsetMs,
    currentChartTimeMs,
    gameState.gameStarted,
    gameState.gameEnded,
    subtitles.length,
    timelineIndex,
  ]);

  const setSubtitles = useCallback<React.Dispatch<React.SetStateAction<SubtitleCue[]>>>((value) => {
    if (typeof value === 'function') {
      setSubtitlesState((prev) => {
        const next = sortSubtitles(value(prev));
        const nextKey = getSubtitleStateKey(next);
        if (lastSubtitleStateKeyRef.current === nextKey) {
          return prev;
        }
        lastSubtitleStateKeyRef.current = nextKey;
        prepareSubtitleFonts(next, lastFontKeyRef);
        return next;
      });
      return;
    }

    const next = sortSubtitles(value);
    const nextKey = getSubtitleStateKey(next);
    if (lastSubtitleStateKeyRef.current === nextKey) {
      return;
    }
    lastSubtitleStateKeyRef.current = nextKey;
    prepareSubtitleFonts(next, lastFontKeyRef);
    setSubtitlesState(next);
  }, []);

  const loadSubtitlesForChart = useCallback(async (chartId: string | string[] | undefined) => {
    try {
      let cues: SubtitleCue[] = [];
      let tracks: import('../types/subtitle').SubtitleTrack[] = [];
      const chartIds = (Array.isArray(chartId) ? chartId : [chartId])
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim());

      if (!chartIds.length) {
        setSubtitles([]);
        return;
      }

      for (const candidateId of chartIds) {
        const shouldForceLocal = candidateId.startsWith('local-');
        if (isSupabaseConfigured && !shouldForceLocal) {
          cues = await subtitleAPI.getSubtitlesByChartId(candidateId);
          tracks = localSubtitleStorage.getTracks(candidateId);
        }

        if (!cues.length || shouldForceLocal) {
          const localCues = localSubtitleStorage.get(candidateId);
          if (localCues.length) {
            cues = localCues;
            tracks = localSubtitleStorage.getTracks(candidateId);
          }
        }

        if (cues.length) break;
      }

      const normalized = normalizeSubtitlePayload(
        chartIds[0],
        cues,
        tracks
      );
      await ensureSubtitleFontsReady(
        normalized.subtitles.map((cue) => cue.style?.fontFamily || 'Noto Sans KR, sans-serif')
      );
      setSubtitles(normalized.subtitles);
    } catch (e) {
      console.error('Failed to load subtitles', e);
      setSubtitles([]);
    }
  }, [setSubtitles]);

  const getSubtitleOpacity = useCallback((cue: SubtitleCue, chartTimeMs: number) => {
    const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
    const inEffect = style.inEffect ?? 'none';
    const outEffect = style.outEffect ?? 'none';
    const inDuration = style.inDurationMs ?? 120;
    const outDuration = style.outDurationMs ?? 120;

    if (chartTimeMs < cue.startTimeMs) return 0;

    if (chartTimeMs < cue.startTimeMs + inDuration && inEffect === 'fade') {
      const t = (chartTimeMs - cue.startTimeMs) / Math.max(1, inDuration);
      return Math.max(0, Math.min(1, t));
    }

    if (chartTimeMs <= cue.endTimeMs) {
      return 1;
    }

    if (outEffect === 'fade' && chartTimeMs <= cue.endTimeMs + outDuration) {
      const t = (chartTimeMs - cue.endTimeMs) / Math.max(1, outDuration);
      return Math.max(0, Math.min(1, 1 - t));
    }

    return 0;
  }, []);

  const activeSubtitles = useMemo(() => {
    const shouldProfile = isGameplayProfilerEnabled();
    const profileStart = shouldProfile ? performance.now() : 0;
    const recordProfile = (count: number) => {
      if (shouldProfile) {
        recordGameplayMetric('activeSubtitle', performance.now() - profileStart, count);
      }
    };

    if (!subtitles.length) {
      recordProfile(0);
      return [];
    }
    if (!gameState.gameStarted || gameState.gameEnded) {
      recordProfile(0);
      return [];
    }

    // currentTimeRef remains the source time; subtitles use a coarse bucket to favor input stability.
    const t = subtitleClockTimeMs;
    const { byStart, byEnd } = timelineIndex;
    const startedCount = upperBoundStarted(byStart, t);
    const firstNotEndedIndex = lowerBoundNotEnded(byEnd, t);
    const notEndedCount = byEnd.length - firstNotEndedIndex;
    const active: Array<ActiveSubtitle & { originalIndex: number }> = [];

    if (startedCount <= notEndedCount) {
      for (let i = 0; i < startedCount; i++) {
        const entry = byStart[i];
        if (entry.effectiveEndTimeMs < t) continue;
        const opacity = getSubtitleOpacity(entry.cue, t);
        if (opacity > 0) {
          active.push({ cue: entry.cue, opacity, originalIndex: entry.originalIndex });
        }
      }
    } else {
      for (let i = firstNotEndedIndex; i < byEnd.length; i++) {
        const entry = byEnd[i];
        if (entry.startTimeMs > t) continue;
        const opacity = getSubtitleOpacity(entry.cue, t);
        if (opacity > 0) {
          active.push({ cue: entry.cue, opacity, originalIndex: entry.originalIndex });
        }
      }
    }

    active.sort((a, b) => a.originalIndex - b.originalIndex);
    recordProfile(active.length);
    return active.map(({ cue, opacity }) => ({ cue, opacity }));
  }, [subtitles.length, gameState.gameStarted, gameState.gameEnded, subtitleClockTimeMs, getSubtitleOpacity, timelineIndex]);

  return {
    subtitles,
    setSubtitles,
    loadSubtitlesForChart,
    getSubtitleOpacity,
    activeSubtitles,
  };
}
