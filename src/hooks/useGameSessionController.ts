import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { DEFAULT_GAME_DURATION } from '../constants/gameConstants';
import type { BgaVisibilityInterval, GameState, Note } from '../types/game';
import type { SubtitleCue } from '../types/subtitle';
import { buildInitialScore, type AudioSettings } from '../utils/gameHelpers';

export interface ResetGameSessionOptions {
  notes?: Note[];
  currentTime?: number;
  resetPreparedNotes?: boolean;
  resetBgaIntervalsRef?: boolean;
  resetYoutube?: boolean;
  resetSubtitles?: boolean;
  resetBgaIntervals?: boolean;
  resetDynamicDuration?: boolean;
  resetPlaySession?: boolean;
}

export interface ResetGameSessionRuntimeConfig {
  setGameState: Dispatch<SetStateAction<GameState>>;
  setIsTestMode?: (value: boolean) => void;
  setIsFromEditor?: (value: boolean) => void;
  setTestAudioSettings?: (settings: AudioSettings | null) => void;
  setTestYoutubeVideoId?: (videoId: string | null) => void;
  setSubtitles?: (subtitles: SubtitleCue[]) => void;
  setBgaVisibilityIntervals?: (intervals: BgaVisibilityInterval[]) => void;
  setDynamicGameDuration?: (duration: number) => void;
  setPlaySessionToken?: (token: string | null) => void;
  destroyYoutubePlayer?: () => void;
  currentTimeRef?: MutableRefObject<number>;
  gameStateRef?: MutableRefObject<GameState>;
  processedMissNotesRef?: MutableRefObject<Set<number>>;
  hitNoteIdsRef?: MutableRefObject<Set<number>>;
  preparedNotesRef?: MutableRefObject<Note[]>;
  bgaIntervalsRef?: MutableRefObject<BgaVisibilityInterval[]>;
  hasRecordedPlayRef?: MutableRefObject<boolean>;
  hasSubmittedScoreRef?: MutableRefObject<boolean>;
  playSessionRequestChartIdRef?: MutableRefObject<string | null>;
  resetPressedKeys?: () => void;
  resetHoldingNotes?: () => void;
  resetProcessedMissNotes?: () => void;
}

export const resetGameSessionRuntime = (
  config: ResetGameSessionRuntimeConfig,
  options: ResetGameSessionOptions = {}
) => {
  const {
    setGameState,
    setIsTestMode,
    setIsFromEditor,
    setTestAudioSettings,
    setTestYoutubeVideoId,
    setSubtitles,
    setBgaVisibilityIntervals,
    setDynamicGameDuration,
    setPlaySessionToken,
    destroyYoutubePlayer,
    currentTimeRef,
    gameStateRef,
    processedMissNotesRef,
    hitNoteIdsRef,
    preparedNotesRef,
    bgaIntervalsRef,
    hasRecordedPlayRef,
    hasSubmittedScoreRef,
    playSessionRequestChartIdRef,
    resetPressedKeys,
    resetHoldingNotes,
    resetProcessedMissNotes,
  } = config;

  const currentTime = Number.isFinite(options.currentTime) ? options.currentTime! : 0;
  const notes = options.notes ?? [];

  setIsTestMode?.(false);
  setIsFromEditor?.(false);
  resetPressedKeys?.();
  resetHoldingNotes?.();
  resetProcessedMissNotes?.();
  processedMissNotesRef?.current.clear();
  hitNoteIdsRef?.current.clear();

  if (options.resetPreparedNotes !== false && preparedNotesRef) {
    preparedNotesRef.current = [];
  }
  if (options.resetBgaIntervalsRef !== false && bgaIntervalsRef) {
    bgaIntervalsRef.current = [];
  }
  if (currentTimeRef) {
    currentTimeRef.current = currentTime;
  }

  if (options.resetYoutube !== false) {
    setTestAudioSettings?.(null);
    setTestYoutubeVideoId?.(null);
    destroyYoutubePlayer?.();
  }
  if (options.resetSubtitles !== false) {
    setSubtitles?.([]);
  }
  if (options.resetBgaIntervals !== false) {
    setBgaVisibilityIntervals?.([]);
  }
  if (options.resetDynamicDuration !== false) {
    setDynamicGameDuration?.(DEFAULT_GAME_DURATION);
  }
  if (options.resetPlaySession !== false) {
    hasRecordedPlayRef && (hasRecordedPlayRef.current = false);
    hasSubmittedScoreRef && (hasSubmittedScoreRef.current = false);
    playSessionRequestChartIdRef && (playSessionRequestChartIdRef.current = null);
    setPlaySessionToken?.(null);
  }

  const nextSessionState: GameState = {
    ...(gameStateRef?.current ?? {
      notes: [],
      score: buildInitialScore(),
      currentTime: 0,
      gameStarted: false,
      gameEnded: false,
    }),
    notes,
    score: buildInitialScore(),
    currentTime,
    gameStarted: false,
    gameEnded: false,
  };

  if (gameStateRef) {
    gameStateRef.current = nextSessionState;
  }
  setGameState(nextSessionState);
};

export const useGameSessionController = (config: ResetGameSessionRuntimeConfig) => {
  const {
    setGameState,
    setIsTestMode,
    setIsFromEditor,
    setTestAudioSettings,
    setTestYoutubeVideoId,
    setSubtitles,
    setBgaVisibilityIntervals,
    setDynamicGameDuration,
    setPlaySessionToken,
    destroyYoutubePlayer,
    currentTimeRef,
    gameStateRef,
    processedMissNotesRef,
    hitNoteIdsRef,
    preparedNotesRef,
    bgaIntervalsRef,
    hasRecordedPlayRef,
    hasSubmittedScoreRef,
    playSessionRequestChartIdRef,
    resetPressedKeys,
    resetHoldingNotes,
    resetProcessedMissNotes,
  } = config;

  const resetGameSession = useCallback(
    (options?: ResetGameSessionOptions) => {
      resetGameSessionRuntime(
        {
          setGameState,
          setIsTestMode,
          setIsFromEditor,
          setTestAudioSettings,
          setTestYoutubeVideoId,
          setSubtitles,
          setBgaVisibilityIntervals,
          setDynamicGameDuration,
          setPlaySessionToken,
          destroyYoutubePlayer,
          currentTimeRef,
          gameStateRef,
          processedMissNotesRef,
          hitNoteIdsRef,
          preparedNotesRef,
          bgaIntervalsRef,
          hasRecordedPlayRef,
          hasSubmittedScoreRef,
          playSessionRequestChartIdRef,
          resetPressedKeys,
          resetHoldingNotes,
          resetProcessedMissNotes,
        },
        options
      );
    },
    [
      setGameState,
      setIsTestMode,
      setIsFromEditor,
      setTestAudioSettings,
      setTestYoutubeVideoId,
      setSubtitles,
      setBgaVisibilityIntervals,
      setDynamicGameDuration,
      setPlaySessionToken,
      destroyYoutubePlayer,
      currentTimeRef,
      gameStateRef,
      processedMissNotesRef,
      hitNoteIdsRef,
      preparedNotesRef,
      bgaIntervalsRef,
      hasRecordedPlayRef,
      hasSubmittedScoreRef,
      playSessionRequestChartIdRef,
      resetPressedKeys,
      resetHoldingNotes,
      resetProcessedMissNotes,
    ]
  );

  return { resetGameSession };
};
