import { useState, useRef, useCallback } from 'react';
import { GameState, Note, BgaVisibilityInterval, EmbeddedAudioTrack, LanePositionInterval } from '../types/game';
import { buildInitialScore, calculateGameDuration } from '../utils/gameHelpers';
import { DEFAULT_GAME_DURATION, START_DELAY_MS } from '../constants/gameConstants';
import { normalizeBgaIntervalsForRuntime } from '../utils/bgaVisibility';
import { SubtitleCue, SubtitleTrack } from '../types/subtitle';
import { normalizeSubtitlePayload } from '../utils/subtitleNormalization';
import { resetGameSessionRuntime } from './useGameSessionController';

export interface EditorTestPayload {
  notes: Note[];
  startTimeMs: number;
  youtubeVideoId: string | null;
  youtubeUrl: string;
  playbackSpeed: number;
  audioOffsetMs?: number;
  startDelayMs?: number;
  chartId?: string;
  bgaVisibilityIntervals?: BgaVisibilityInterval[];
  lanePositionIntervals?: LanePositionInterval[];
  overlayAudioTrack?: EmbeddedAudioTrack | null;
  subtitles?: SubtitleCue[];
  subtitleTracks?: SubtitleTrack[];
}

export interface UseTestSessionOptions {
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onSubtitlesLoad: (chartId: string | string[] | undefined) => void;
  onSubtitlesSet: (subtitles: SubtitleCue[]) => void;
  onSubtitlesClear: () => void;
  onBgaIntervalsSet: (intervals: BgaVisibilityInterval[]) => void;
  onYoutubeVideoIdSet: (videoId: string | null) => void;
  onAudioSettingsSet: (settings: any) => void;
  onEditorClose: () => void;
  onPressedKeysReset: () => void;
  onHoldingNotesReset: () => void;
  onProcessedMissNotesClear: () => void;
}

export interface UseTestSessionReturn {
  isTestMode: boolean;
  isFromEditor: boolean;
  dynamicGameDuration: number;
  startTestSession: (
    notes: Note[],
    intervals: BgaVisibilityInterval[],
    startDelayMs?: number,
    chartTimeOffsetMs?: number
  ) => void;
  handleEditorTest: (payload: EditorTestPayload) => void;
  handleRetest: () => void;
  reset: () => void;
  setIsTestMode: (value: boolean) => void;
  setIsFromEditor: (value: boolean) => void;
  setDynamicGameDuration: (duration: number) => void;
  preparedNotesRef: React.MutableRefObject<Note[]>;
  bgaIntervalsRef: React.MutableRefObject<BgaVisibilityInterval[]>;
}

export function useTestSession({
  setGameState,
  onSubtitlesLoad,
  onSubtitlesSet,
  onSubtitlesClear,
  onBgaIntervalsSet,
  onYoutubeVideoIdSet,
  onAudioSettingsSet,
  onEditorClose,
  onPressedKeysReset,
  onHoldingNotesReset,
  onProcessedMissNotesClear,
}: UseTestSessionOptions): UseTestSessionReturn {
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const [isFromEditor, setIsFromEditor] = useState<boolean>(false);
  const [dynamicGameDuration, setDynamicGameDuration] = useState<number>(DEFAULT_GAME_DURATION);
  const preparedNotesRef = useRef<Note[]>([]);
  const bgaIntervalsRef = useRef<BgaVisibilityInterval[]>([]);
  const startDelayMsRef = useRef<number>(START_DELAY_MS);
  const chartTimeOffsetMsRef = useRef<number>(0);

  const startTestSession = useCallback(
    (
      preparedNotes: Note[],
      visibilityIntervals: BgaVisibilityInterval[] = [],
      startDelayMs = START_DELAY_MS,
      chartTimeOffsetMs = chartTimeOffsetMsRef.current
    ) => {
      if (!preparedNotes.length) return;
      const safeStartDelayMs = Number.isFinite(startDelayMs) ? Math.max(0, Math.round(startDelayMs)) : START_DELAY_MS;
      const safeChartTimeOffsetMs = Number.isFinite(chartTimeOffsetMs) ? Math.max(0, chartTimeOffsetMs) : 0;
      startDelayMsRef.current = safeStartDelayMs;
      chartTimeOffsetMsRef.current = safeChartTimeOffsetMs;
      
      onProcessedMissNotesClear();
      onPressedKeysReset();
      onHoldingNotesReset();

      // 채보 마지막 노트 기준으로 게임 길이 계산
      const clampedDuration = calculateGameDuration(preparedNotes);
      setDynamicGameDuration(clampedDuration);
      
      const sortedIntervals = normalizeBgaIntervalsForRuntime(
        visibilityIntervals,
        safeChartTimeOffsetMs + clampedDuration
      );
      bgaIntervalsRef.current = sortedIntervals;
      onBgaIntervalsSet(sortedIntervals);

      setGameState((prev) => ({
        ...prev,
        gameStarted: true,
        notes: preparedNotes.map((note, index) => ({
          ...note,
          id: index + 1,
          y: -100, // 게임 시작 시 모든 노트는 화면 위에서 시작
          hit: false,
        })),
        score: buildInitialScore(),
        currentTime: -safeStartDelayMs,
        gameEnded: false,
      }));
    },
    [setGameState, onBgaIntervalsSet, onPressedKeysReset, onHoldingNotesReset, onProcessedMissNotesClear]
  );

  const handleEditorTest = useCallback(
    (payload: EditorTestPayload) => {
      const startMs = Math.max(0, Math.floor(payload.startTimeMs || 0));
      const preparedNotes = payload.notes
        .map((note) => {
          const rawDuration =
            typeof note.duration === 'number'
              ? Math.max(0, note.duration)
              : Math.max(
                  0,
                  (typeof note.endTime === 'number' ? note.endTime : note.time) - note.time
                );
          const originalEnd =
            typeof note.endTime === 'number' ? note.endTime : note.time + rawDuration;
          if (originalEnd < startMs) {
            return null;
          }
          const adjustedStart = Math.max(note.time, startMs);
          const trimmedDuration = Math.max(0, originalEnd - adjustedStart);
          const relativeStart = adjustedStart - startMs;
          const relativeEnd = relativeStart + trimmedDuration;
          return {
            ...note,
            time: relativeStart,
            duration: trimmedDuration,
            endTime: relativeEnd,
            type: trimmedDuration > 0 ? 'hold' : 'tap',
            y: 0,
            hit: false,
          };
        })
        .filter((note): note is Note => note !== null)
        .sort((a, b) => a.time - b.time)
        .map((note, index) => ({ ...note, id: index + 1 }));

      if (!preparedNotes.length) {
        alert('선택한 시작 위치 이후에 노트가 없습니다. 시작 위치를 조정해주세요.');
        return;
      }

      // YouTube 오디오 설정 전달
      onAudioSettingsSet({
        youtubeVideoId: payload.youtubeVideoId,
        youtubeUrl: payload.youtubeUrl,
        startTimeMs: startMs,
        playbackSpeed: payload.playbackSpeed || 1,
        audioOffsetMs: payload.audioOffsetMs ?? 0,
        startDelayMs: payload.startDelayMs ?? START_DELAY_MS,
        overlayAudioTrack: payload.overlayAudioTrack ?? null,
      });

      preparedNotesRef.current = preparedNotes.map((note) => ({ ...note }));
      setIsTestMode(true);
      setIsFromEditor(true); // 에디터에서 테스트 시작
      onEditorClose();

      if (Array.isArray(payload.subtitles) && payload.subtitles.length > 0) {
        onSubtitlesSet(
          normalizeSubtitlePayload(
            payload.chartId || 'editor-test',
            payload.subtitles,
            Array.isArray(payload.subtitleTracks) ? payload.subtitleTracks : []
          ).subtitles
        );
      } else if (payload.chartId) {
        onSubtitlesLoad(payload.chartId);
      } else {
        onSubtitlesClear();
      }
      
      // YouTube 플레이어 초기화를 위해 videoId 설정
      onYoutubeVideoIdSet(payload.youtubeVideoId);
      
      startTestSession(
        preparedNotes,
        payload.bgaVisibilityIntervals || [],
        payload.startDelayMs ?? START_DELAY_MS,
        startMs
      );
    },
    [startTestSession, onSubtitlesLoad, onSubtitlesSet, onSubtitlesClear, onYoutubeVideoIdSet, onAudioSettingsSet, onEditorClose]
  );

  const handleRetest = useCallback(() => {
    if (!preparedNotesRef.current.length) return;
    setIsTestMode(true);
    const clonedNotes = preparedNotesRef.current.map((note) => ({ ...note }));
    startTestSession(clonedNotes, bgaIntervalsRef.current, startDelayMsRef.current);
  }, [startTestSession]);

  const reset = useCallback(() => {
    chartTimeOffsetMsRef.current = 0;
    resetGameSessionRuntime({
      setGameState,
      setIsTestMode,
      setIsFromEditor,
      setTestAudioSettings: onAudioSettingsSet,
      setTestYoutubeVideoId: onYoutubeVideoIdSet,
      setSubtitles: onSubtitlesSet,
      setBgaVisibilityIntervals: onBgaIntervalsSet,
      setDynamicGameDuration,
      preparedNotesRef,
      bgaIntervalsRef,
      resetPressedKeys: onPressedKeysReset,
      resetHoldingNotes: onHoldingNotesReset,
      resetProcessedMissNotes: onProcessedMissNotesClear,
    });
  }, [
    setGameState,
    onAudioSettingsSet,
    onYoutubeVideoIdSet,
    onSubtitlesSet,
    onBgaIntervalsSet,
    onPressedKeysReset,
    onHoldingNotesReset,
    onProcessedMissNotesClear,
  ]);

  return {
    isTestMode,
    isFromEditor,
    dynamicGameDuration,
    startTestSession,
    handleEditorTest,
    handleRetest,
    reset,
    setIsTestMode,
    setIsFromEditor,
    setDynamicGameDuration,
    preparedNotesRef,
    bgaIntervalsRef,
  };
}

