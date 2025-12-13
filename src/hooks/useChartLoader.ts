import { useCallback } from 'react';
import { GameState, Note, BgaVisibilityInterval, SpeedChange } from '../types/game';
import { buildInitialScore, AudioSettings } from '../utils/gameHelpers';
import { calculateGameDuration } from '../utils/gameHelpers';
import { MAX_CHART_DURATION } from '../constants/gameConstants';
import { START_DELAY_MS } from '../constants/gameConstants';

export interface UseChartLoaderOptions {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onYoutubeDestroy: () => void;
  onYoutubeSetup: (videoId: string | null, settings: AudioSettings | null) => void;
  onTestModeSet: (value: boolean) => void;
  onSubtitlesLoad: (chartId: string | undefined) => void;
  onSubtitlesClear: () => void;
  onBgaIntervalsSet: (intervals: BgaVisibilityInterval[]) => void;
  onBgaIntervalsRefSet: (intervals: BgaVisibilityInterval[]) => void;
  onDynamicGameDurationSet: (duration: number) => void;
  onBaseBpmSet: (bpm: number) => void;
  onSpeedChangesSet: (changes: SpeedChange[]) => void;
  onHoldingNotesReset: () => void;
  onProcessedMissNotesReset: () => void;
  onChartSelectClose: () => void;
}

export interface UseChartLoaderReturn {
  loadChart: (chartData: any) => void;
}

export function useChartLoader({
  gameState,
  setGameState,
  onYoutubeDestroy,
  onYoutubeSetup,
  onTestModeSet,
  onSubtitlesLoad,
  onSubtitlesClear,
  onBgaIntervalsSet,
  onBgaIntervalsRefSet,
  onDynamicGameDurationSet,
  onBaseBpmSet,
  onSpeedChangesSet,
  onHoldingNotesReset,
  onProcessedMissNotesReset,
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

      onChartSelectClose();
      
      // 기존 테스트 모드 플레이어 정리
      onYoutubeDestroy();
      
      // YouTube 플레이어 설정 (필요시) - 먼저 설정해야 useEffect가 올바르게 작동함
      if (chartData.youtubeVideoId) {
        const audioSettings: AudioSettings = {
          youtubeVideoId: chartData.youtubeVideoId,
          youtubeUrl: chartData.youtubeUrl || '',
          startTimeMs: 0,
          playbackSpeed: 1,
          chartId: chartData.chartId,
        };
        onYoutubeSetup(chartData.youtubeVideoId, audioSettings);
        onTestModeSet(true);
      } else {
        onTestModeSet(false);
        onYoutubeSetup(null, chartData.chartId
          ? {
              youtubeVideoId: null,
              youtubeUrl: chartData.youtubeUrl || '',
              startTimeMs: 0,
              playbackSpeed: 1,
              chartId: chartData.chartId,
            }
          : null);
      }
      
      // 선택된 채보 데이터로 게임 상태 초기화 (키 중복 방지 및 기본 필드 보정)
      const preparedNotes = chartData.notes
        .map((note: Note, index: number) => {
          const safeDuration =
            typeof note.duration === 'number'
              ? Math.max(0, note.duration)
              : Math.max(
                  0,
                  (typeof note.endTime === 'number' ? note.endTime : note.time) - note.time
                );
          const endTime =
            typeof note.endTime === 'number' ? note.endTime : note.time + safeDuration;
          return {
            ...note,
            id: index + 1, // React key/게임 로직 모두에서 고유 ID 보장
            time: Math.max(0, note.time),
            duration: safeDuration,
            endTime,
            type: safeDuration > 0 ? 'hold' : 'tap',
            y: 0,
            hit: false,
          };
        })
        .sort((a: Note, b: Note) => a.time - b.time);
      
      if (preparedNotes.length === 0) {
        alert('이 채보에는 노트가 없습니다.');
        return;
      }

      const chartIntervals: BgaVisibilityInterval[] = Array.isArray(chartData.bgaVisibilityIntervals)
        ? [...chartData.bgaVisibilityIntervals]
        : [];
      const sortedIntervals: BgaVisibilityInterval[] = chartIntervals
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
        .sort((a, b) => a.startTimeMs - b.startTimeMs);
      onBgaIntervalsSet(sortedIntervals);
      onBgaIntervalsRefSet(sortedIntervals);

      // 채보 마지막 노트 기준으로 게임 길이 계산
      const clampedDuration = calculateGameDuration(preparedNotes);
      onDynamicGameDurationSet(clampedDuration);
      
      setGameState({
        notes: preparedNotes,
        score: buildInitialScore(),
        currentTime: -START_DELAY_MS,
        gameStarted: true,
        gameEnded: false,
      });
      
      if (typeof chartData.bpm === 'number') {
        onBaseBpmSet(chartData.bpm);
      } else {
        onBaseBpmSet(120);
      }
      onSpeedChangesSet(chartData.speedChanges || []);
      
      onHoldingNotesReset();
      onProcessedMissNotesReset();

      // 자막 로드 (chartId가 있을 때만)
      if (chartData.chartId) {
        onSubtitlesLoad(chartData.chartId);
      } else {
        onSubtitlesClear();
      }
    } catch (error) {
      console.error('Failed to load chart:', error);
      alert('채보를 불러오는데 실패했습니다. 다시 시도해주세요.');
    }
  }, [
    setGameState,
    onYoutubeDestroy,
    onYoutubeSetup,
    onTestModeSet,
    onSubtitlesLoad,
    onSubtitlesClear,
    onBgaIntervalsSet,
    onBgaIntervalsRefSet,
    onDynamicGameDurationSet,
    onBaseBpmSet,
    onSpeedChangesSet,
    onHoldingNotesReset,
    onProcessedMissNotesReset,
    onChartSelectClose,
  ]);

  return {
    loadChart,
  };
}

