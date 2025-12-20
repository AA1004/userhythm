import { useCallback } from 'react';
import { GameState, Note, BgaVisibilityInterval, SpeedChange } from '../types/game';
import { buildInitialScore, AudioSettings } from '../utils/gameHelpers';
import { calculateGameDuration } from '../utils/gameHelpers';
import { START_DELAY_MS } from '../constants/gameConstants';
import { SubtitleCue, DEFAULT_SUBTITLE_STYLE } from '../types/subtitle';

export interface UseChartLoaderOptions {
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onYoutubeDestroy: () => void;
  onYoutubeSetup: (videoId: string | null, settings: AudioSettings | null) => void;
  onTestModeSet: (value: boolean) => void;
  onSubtitlesLoad: (chartId: string | undefined) => void;
  onSubtitlesSet: (subtitles: SubtitleCue[]) => void;
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
  setGameState,
  onYoutubeDestroy,
  onYoutubeSetup,
  onTestModeSet,
  onSubtitlesLoad,
  onSubtitlesSet,
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
      
      // 선택된 채보 데이터로 게임 상태 초기화 (키 중복 방지 및 기본 필드 보정 + 유령노트 정리)
      const preparedNotes = chartData.notes
        .map((note: Note, index: number) => {
          // 유령노트 정리: hit 상태를 항상 false로 리셋
          const cleanedNote = {
            ...note,
            hit: false,
          };
          
          // duration이 0이거나 음수면 무조건 탭 노트로 처리
          const isTapNote = (cleanedNote.duration ?? 0) <= 0 || cleanedNote.type === 'tap';
          
          const safeDuration = isTapNote
            ? 0
            : (typeof cleanedNote.duration === 'number'
                ? Math.max(0, cleanedNote.duration)
                : Math.max(
                    0,
                    (typeof cleanedNote.endTime === 'number' && cleanedNote.endTime > cleanedNote.time
                      ? cleanedNote.endTime - cleanedNote.time
                      : 0)
                  ));
          
          // endTime 계산 및 검증
          let endTime: number;
          if (isTapNote) {
            // 탭 노트는 항상 endTime === time
            endTime = cleanedNote.time;
          } else {
            // 롱노트의 경우
            if (typeof cleanedNote.endTime === 'number' && cleanedNote.endTime > cleanedNote.time) {
              endTime = cleanedNote.endTime;
              // endTime과 duration이 일치하지 않으면 duration 기준으로 수정
              const expectedEndTime = cleanedNote.time + safeDuration;
              if (Math.abs(endTime - expectedEndTime) > 1) { // 1ms 오차 허용
                endTime = expectedEndTime;
              }
            } else {
              endTime = cleanedNote.time + safeDuration;
            }
          }
          
          return {
            ...cleanedNote,
            id: index + 1, // React key/게임 로직 모두에서 고유 ID 보장
            time: Math.max(0, cleanedNote.time),
            duration: safeDuration,
            endTime,
            type: safeDuration > 0 ? 'hold' : 'tap',
            y: -100, // 게임 시작 시 모든 노트는 화면 위에서 시작
            hit: false,
          };
        })
        .filter((note: Note) => {
          // 유효하지 않은 노트 필터링 (유령노트 제거)
          // time이 음수이거나 NaN인 경우 제거
          if (note.time < 0 || isNaN(note.time)) return false;
          // endTime이 NaN인 경우 제거
          if (isNaN(note.endTime)) return false;
          // 롱노트인데 endTime이 time보다 작은 경우만 제거 (단노트는 endTime === time이 정상)
          if (note.duration > 0 && note.endTime < note.time) return false;
          return true;
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

      // 자막 로드: 채보에 포함된 자막이 있으면 사용, 없으면 로컬 스토리지에서 로드
      if (Array.isArray(chartData.subtitles) && chartData.subtitles.length > 0) {
        // 자막 데이터를 SubtitleCue 형식으로 변환
        const convertedSubtitles: SubtitleCue[] = chartData.subtitles.map((sub: any, idx: number) => ({
          id: sub.id || `subtitle-${idx}`,
          chartId: sub.chartId || chartData.chartId || '',
          trackId: sub.trackId || 'default',
          startTimeMs: sub.startTimeMs ?? sub.startTime ?? 0,
          endTimeMs: sub.endTimeMs ?? sub.endTime ?? 0,
          text: sub.text || '',
          style: sub.style || DEFAULT_SUBTITLE_STYLE,
        }));
        onSubtitlesSet(convertedSubtitles);
      } else if (chartData.chartId) {
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
    onSubtitlesSet,
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

