import { useState, useCallback, useMemo } from 'react';
import { SubtitleCue, SubtitleStyle, loadStoredWebFonts } from '../types/subtitle';
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

export function useSubtitles(gameState: GameState, currentChartTimeMs: number): UseSubtitlesReturn {
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);

  // 자막 불러오기
  const loadSubtitlesForChart = useCallback(async (chartId: string) => {
    try {
      // 커스텀 폰트를 먼저 로드 (자막이 커스텀 폰트를 사용할 수 있도록)
      await loadStoredWebFonts();

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

      cues.sort((a, b) => a.startTimeMs - b.startTimeMs);
      setSubtitles(cues);
    } catch (e) {
      console.error('자막을 불러오지 못했습니다:', e);
      setSubtitles([]);
    }
  }, []);

  // 자막 페이드 인/아웃 포함 opacity 계산
  const getSubtitleOpacity = useCallback((cue: SubtitleCue, chartTimeMs: number) => {
    const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
    const inEffect = style.inEffect ?? 'none';
    const outEffect = style.outEffect ?? 'none';
    const inDuration = style.inDurationMs ?? 120;
    const outDuration = style.outDurationMs ?? 120;

    if (chartTimeMs < cue.startTimeMs) return 0;

    // in 페이드
    if (chartTimeMs < cue.startTimeMs + inDuration && inEffect === 'fade') {
      const t = (chartTimeMs - cue.startTimeMs) / Math.max(1, inDuration);
      return Math.max(0, Math.min(1, t));
    }

    // 메인 표시 구간
    if (chartTimeMs <= cue.endTimeMs) {
      return 1;
    }

    // out 페이드
    if (outEffect === 'fade' && chartTimeMs <= cue.endTimeMs + outDuration) {
      const t = (chartTimeMs - cue.endTimeMs) / Math.max(1, outDuration);
      return Math.max(0, Math.min(1, 1 - t));
    }

    return 0;
  }, []);

  const activeSubtitles = useMemo(() => {
    if (!subtitles.length) return [];
    if (!gameState.gameStarted) return [];

    const t = currentChartTimeMs;

    return subtitles
      .map((cue) => {
        const opacity = getSubtitleOpacity(cue, t);
        return opacity > 0
          ? {
              cue,
              opacity,
            }
          : null;
      })
      .filter((x): x is ActiveSubtitle => x !== null);
  }, [subtitles, gameState.gameStarted, currentChartTimeMs, getSubtitleOpacity]);

  return {
    subtitles,
    setSubtitles,
    loadSubtitlesForChart,
    getSubtitleOpacity,
    activeSubtitles,
  };
}

