import { useState, useRef, useCallback } from 'react';
import { GameState, Note, BgaVisibilityInterval } from '../types/game';
import { buildInitialScore, calculateGameDuration } from '../utils/gameHelpers';
import { DEFAULT_GAME_DURATION, START_DELAY_MS } from '../constants/gameConstants';

export interface EditorTestPayload {
  notes: Note[];
  startTimeMs: number;
  youtubeVideoId: string | null;
  youtubeUrl: string;
  playbackSpeed: number;
  audioOffsetMs?: number;
  chartId?: string;
  bgaVisibilityIntervals?: BgaVisibilityInterval[];
}

export interface UseTestSessionOptions {
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  onSubtitlesLoad: (chartId: string) => void;
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
  startTestSession: (notes: Note[], intervals: BgaVisibilityInterval[]) => void;
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

  const startTestSession = useCallback(
    (preparedNotes: Note[], visibilityIntervals: BgaVisibilityInterval[] = []) => {
      if (!preparedNotes.length) return;
      
      onProcessedMissNotesClear();
      onPressedKeysReset();
      onHoldingNotesReset();

      // 채보 마지막 노트 기준으로 게임 길이 계산
      const clampedDuration = calculateGameDuration(preparedNotes);
      setDynamicGameDuration(clampedDuration);
      
      const sortedIntervals = [...visibilityIntervals].sort(
        (a, b) => a.startTimeMs - b.startTimeMs
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
        currentTime: -START_DELAY_MS,
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
      });

      preparedNotesRef.current = preparedNotes.map((note) => ({ ...note }));
      setIsTestMode(true);
      setIsFromEditor(true); // 에디터에서 테스트 시작
      onEditorClose();

      if (payload.chartId) {
        onSubtitlesLoad(payload.chartId);
      } else {
        onSubtitlesClear();
      }
      
      // YouTube 플레이어 초기화를 위해 videoId 설정
      onYoutubeVideoIdSet(payload.youtubeVideoId);
      
      startTestSession(preparedNotes, payload.bgaVisibilityIntervals || []);
    },
    [startTestSession, onSubtitlesLoad, onSubtitlesClear, onYoutubeVideoIdSet, onAudioSettingsSet, onEditorClose]
  );

  const handleRetest = useCallback(() => {
    if (!preparedNotesRef.current.length) return;
    setIsTestMode(true);
    const clonedNotes = preparedNotesRef.current.map((note) => ({ ...note }));
    startTestSession(clonedNotes, bgaIntervalsRef.current);
  }, [startTestSession]);

  const reset = useCallback(() => {
    setIsTestMode(false);
    setIsFromEditor(false);
    preparedNotesRef.current = [];
    bgaIntervalsRef.current = [];
    setDynamicGameDuration(DEFAULT_GAME_DURATION);
    onBgaIntervalsSet([]);
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
      notes: [],
      score: buildInitialScore(),
    }));
  }, [setGameState, onBgaIntervalsSet]);

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

