import { useCallback } from 'react';
import { GameState, BgaVisibilityInterval, LanePositionInterval } from '../types/game';
import { buildInitialScore, AudioSettings, calculatePlayableChartDuration } from '../utils/gameHelpers';
import { START_DELAY_MS } from '../constants/gameConstants';
import { SubtitleCue } from '../types/subtitle';
import { normalizeSubtitlePayload } from '../utils/subtitleNormalization';
import { normalizeBgaIntervalsForRuntime } from '../utils/bgaVisibility';
import { normalizeLanePositionIntervals } from '../utils/lanePositionIntervals';
import { validateNotes } from '../utils/noteValidation';
import type { ResetGameSessionOptions } from './useGameSessionController';

export interface UseChartLoaderOptions {
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onSessionReset: (options?: ResetGameSessionOptions) => void;
  onYoutubeSetup: (videoId: string | null, settings: AudioSettings | null) => void;
  onSubtitlesLoad: (chartId: string | string[] | undefined) => void;
  onSubtitlesSet: (subtitles: SubtitleCue[]) => void;
  onSubtitlesClear: () => void;
  onBgaIntervalsSet: (intervals: BgaVisibilityInterval[]) => void;
  onBgaIntervalsRefSet: (intervals: BgaVisibilityInterval[]) => void;
  onLanePositionIntervalsSet?: (intervals: LanePositionInterval[]) => void;
  onDynamicGameDurationSet: (duration: number) => void;
  onChartSelectClose: () => void;
}

export interface UseChartLoaderReturn {
  loadChart: (chartData: any) => void;
}

export function useChartLoader({
  setGameState,
  onSessionReset,
  onYoutubeSetup,
  onSubtitlesLoad,
  onSubtitlesSet,
  onSubtitlesClear,
  onBgaIntervalsSet,
  onBgaIntervalsRefSet,
  onLanePositionIntervalsSet,
  onDynamicGameDurationSet,
  onChartSelectClose,
}: UseChartLoaderOptions): UseChartLoaderReturn {
  const loadChart = useCallback((chartData: any) => {
    try {
      if (!chartData) {
        console.error('Chart data is missing');
        alert('채보 데이터가 없습니다.');
        return;
      }

      if (!chartData.notes || !Array.isArray(chartData.notes)) {
        console.error('Invalid chart data: notes array missing');
        alert('유효하지 않은 채보 데이터입니다.');
        return;
      }

      const startDelayMs =
        typeof chartData.startDelayMs === 'number' && Number.isFinite(chartData.startDelayMs)
          ? Math.max(0, Math.round(chartData.startDelayMs))
          : START_DELAY_MS;

      onChartSelectClose();
      onSessionReset({ currentTime: -startDelayMs });

      // YouTube 플레이어 설정 (필요시) - 먼저 설정해야 useEffect가 올바르게 작동함
      if (chartData.youtubeVideoId) {
        const audioSettings: AudioSettings = {
          youtubeVideoId: chartData.youtubeVideoId,
          youtubeUrl: chartData.youtubeUrl || '',
          startTimeMs: 0,
          playbackSpeed: 1,
          audioOffsetMs: typeof chartData.audioOffsetMs === 'number' ? chartData.audioOffsetMs : 0,
          startDelayMs,
          chartId: chartData.chartId,
        };
        onYoutubeSetup(chartData.youtubeVideoId, audioSettings);
      } else {
        onYoutubeSetup(null, chartData.chartId
          ? {
              youtubeVideoId: null,
              youtubeUrl: chartData.youtubeUrl || '',
              startTimeMs: 0,
              playbackSpeed: 1,
              audioOffsetMs: typeof chartData.audioOffsetMs === 'number' ? chartData.audioOffsetMs : 0,
              startDelayMs,
              chartId: chartData.chartId,
            }
          : null);
      }
      
      // 일반 플레이도 저장/서버 검증과 같은 정규화 계약을 사용한다.
      const preparedNotes = validateNotes(chartData.notes).map((note) => ({
        ...note,
        y: -100,
        hit: false,
      }));
      
      if (preparedNotes.length === 0) {
        alert('이 채보에는 노트가 없습니다.');
        return;
      }

      const chartIntervals: BgaVisibilityInterval[] = Array.isArray(chartData.bgaVisibilityIntervals)
        ? [...chartData.bgaVisibilityIntervals]
        : [];
      const rawLanePositionIntervals: LanePositionInterval[] = Array.isArray(chartData.lanePositionIntervals)
        ? chartData.lanePositionIntervals
        : [];
      const clampedDuration = calculatePlayableChartDuration(preparedNotes, {
        timelineExtraMs: typeof chartData.timelineExtraMs === 'number' ? chartData.timelineExtraMs : 0,
        bgaVisibilityIntervals: chartIntervals,
        lanePositionIntervals: rawLanePositionIntervals,
        subtitles: Array.isArray(chartData.subtitles) ? chartData.subtitles : [],
      });
      const sortedIntervals: BgaVisibilityInterval[] = normalizeBgaIntervalsForRuntime(chartIntervals
        .map((it, idx): BgaVisibilityInterval => ({
          id: typeof it.id === 'string' ? it.id : `bga-${idx}`,
          startTimeMs: Math.max(0, Number(it.startTimeMs) || 0),
          endTimeMs: Math.max(0, Number(it.endTimeMs) || 0),
          mode: it.mode === 'visible' ? 'visible' : 'hidden',
          fadeInMs:
            it.fadeInMs === undefined
              ? undefined
              : Math.max(0, Number(it.fadeInMs) || 0),
          fadeOutMs:
            it.fadeOutMs === undefined
              ? undefined
              : Math.max(0, Number(it.fadeOutMs) || 0),
          easing: it.easing === 'linear' ? 'linear' : undefined,
        }))
        , clampedDuration);
      onBgaIntervalsSet(sortedIntervals);
      onBgaIntervalsRefSet(sortedIntervals);

      const lanePositionIntervals = normalizeLanePositionIntervals(
        rawLanePositionIntervals,
        clampedDuration
      );
      onLanePositionIntervalsSet?.(lanePositionIntervals);

      onDynamicGameDurationSet(clampedDuration);
      
      setGameState({
        notes: preparedNotes,
        score: buildInitialScore(),
        currentTime: -startDelayMs,
        gameStarted: true,
        gameEnded: false,
      });

      // 자막 로드: 채보에 포함된 자막이 있으면 사용, 없으면 로컬 스토리지에서 로드
      if (Array.isArray(chartData.subtitles) && chartData.subtitles.length > 0) {
        const subtitlePayload = normalizeSubtitlePayload(
          chartData.chartId || '',
          chartData.subtitles,
          chartData.subtitleTracks
        );
        onSubtitlesSet(subtitlePayload.subtitles);
      } else {
        const subtitleLookupIds = [
          chartData.chartId,
          chartData.sourceChartId,
          chartData.subtitleSessionId,
          chartData.chartTitle ? `local-${chartData.chartTitle}` : undefined,
        ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

        if (subtitleLookupIds.length) {
          onSubtitlesLoad(subtitleLookupIds);
        } else {
          onSubtitlesClear();
        }
      }
    } catch (error) {
      console.error('Failed to load chart:', error);
      alert('채보를 불러오는데 실패했습니다. 다시 시도해주세요.');
    }
  }, [
    setGameState,
    onSessionReset,
    onYoutubeSetup,
    onSubtitlesLoad,
    onSubtitlesSet,
    onSubtitlesClear,
    onBgaIntervalsSet,
    onBgaIntervalsRefSet,
    onLanePositionIntervalsSet,
    onDynamicGameDurationSet,
    onChartSelectClose,
  ]);

  return {
    loadChart,
  };
}

