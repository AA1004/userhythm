import { useState, useCallback, useMemo } from 'react';
import { SubtitleCue, SubtitleStyle, ensureSubtitleFontsReady } from '../types/subtitle';
import { subtitleAPI, localSubtitleStorage } from '../lib/subtitleAPI';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { GameState } from '../types/game';

export interface ActiveSubtitle {
  cue: SubtitleCue;
  opacity: number;
}

export interface UseSubtitlesReturn {
  subtitles: SubtitleCue[];
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleCue[]>>;
  loadSubtitlesForChart: (chartId: string) => Promise<void>;
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

const getSubtitleEffectiveEndTime = (cue: SubtitleCue): number => {
  const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
  const outEffect = style.outEffect ?? 'none';
  const outDuration = style.outDurationMs ?? 120;
  return cue.endTimeMs + (outEffect === 'fade' ? Math.max(0, outDuration) : 0);
};

const sortSubtitles = (cues: SubtitleCue[]): SubtitleCue[] =>
  [...cues].sort((a, b) => a.startTimeMs - b.startTimeMs || a.endTimeMs - b.endTimeMs);

const prepareSubtitleFonts = (cues: SubtitleCue[]) => {
  if (!cues.length) return;
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

export function useSubtitles(gameState: GameState, currentChartTimeMs: number): UseSubtitlesReturn {
  const [subtitles, setSubtitlesState] = useState<SubtitleCue[]>([]);

  const setSubtitles = useCallback<React.Dispatch<React.SetStateAction<SubtitleCue[]>>>((value) => {
    if (typeof value === 'function') {
      setSubtitlesState((prev) => {
        const next = sortSubtitles(value(prev));
        prepareSubtitleFonts(next);
        return next;
      });
      return;
    }

    const next = sortSubtitles(value);
    prepareSubtitleFonts(next);
    setSubtitlesState(next);
  }, []);

  const loadSubtitlesForChart = useCallback(async (chartId: string) => {
    try {
      let cues: SubtitleCue[] = [];

      const shouldForceLocal = !chartId || chartId.startsWith('local-');
      if (isSupabaseConfigured && !shouldForceLocal) {
        cues = await subtitleAPI.getSubtitlesByChartId(chartId);
      }

      if (!cues.length || shouldForceLocal) {
        const localCues = localSubtitleStorage.get(chartId);
        if (localCues.length) {
          cues = localCues;
        }
      }

      await ensureSubtitleFontsReady(
        cues.map((cue) => cue.style?.fontFamily || 'Noto Sans KR, sans-serif')
      );
      setSubtitles(sortSubtitles(cues));
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

  const activeSubtitles = useMemo(() => {
    if (!subtitles.length) return [];
    if (!gameState.gameStarted) return [];

    const t = currentChartTimeMs;
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
    return active.map(({ cue, opacity }) => ({ cue, opacity }));
  }, [subtitles.length, gameState.gameStarted, currentChartTimeMs, getSubtitleOpacity, timelineIndex]);

  return {
    subtitles,
    setSubtitles,
    loadSubtitlesForChart,
    getSubtitleOpacity,
    activeSubtitles,
  };
}
