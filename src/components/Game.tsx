import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { GameState, LanePositionInterval, Note } from '../types/game';
import { ChartEditor } from './ChartEditor';
import { ChartSelect } from './ChartSelect';
import { ChartSelectTransition } from './ChartSelectTransition';
import { ChartAdmin } from './ChartAdmin';
import { SubtitleEditor } from './SubtitleEditor';
import { SettingsModal } from './SettingsModal';
import { generateNotes } from '../utils/noteGenerator';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { VideoRhythmLayout } from './VideoRhythmLayout';
import { LyricOverlay } from './LyricOverlay';
import {
  DEFAULT_GAME_DURATION,
  START_DELAY_MS,
} from '../constants/gameConstants';
import { buildInitialScore, AudioSettings } from '../utils/gameHelpers';
import { useAuth } from '../hooks/useAuth';
import { useGameSettings } from '../hooks/useGameSettings';
import { useSubtitles } from '../hooks/useSubtitles';
import { useBgaMask } from '../hooks/useBgaMask';
import { useGameViewSize } from '../hooks/useGameViewSize';
import { useTestYoutubePlayer } from '../hooks/useTestYoutubePlayer';
import { useTestSession } from '../hooks/useTestSession';
import { useChartLoader } from '../hooks/useChartLoader';
import { useGameSessionController } from '../hooks/useGameSessionController';
import { GameMenu } from './GameMenu';
import { MainMenuSidebar } from './MainMenuSidebar';
import { GameEndScreen } from './GameEndScreen';
import { FpsHud } from './FpsHud';
import { TutorialScreen } from './TutorialScreen';
import { CalibrationGame } from './CalibrationGame';
import { GameplayRuntimeLayer } from './GameplayRuntimeLayer';
import { GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT } from '../constants/gameLayout';
import { buildPlayfieldGeometry } from '../constants/gameVisualSettings';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { api, ApiChart } from '../lib/api';
import { chartAPI } from '../lib/supabaseClient';
import type { SubtitleCue, SubtitleTrack } from '../types/subtitle';
import { normalizeLanePositionIntervals } from '../utils/lanePositionIntervals';
import { useLanePositionOffset } from '../hooks/useLanePositionOffset';
import { calculateScoreAccuracy } from '../utils/scoreAccuracy';
import { getChartPayload } from '../utils/chartPayload';
import { retryOnceOnTransientFailure } from '../utils/requestRetry';

const EDITOR_CONTRIBUTION_DRAFT_KEY = 'userhythm:editor-contribution-draft';

// Subtitle editor chart data
interface SubtitleEditorChartData {
  chartId: string;
  notes: Note[];
  bpm: number;
  youtubeVideoId?: string | null;
  youtubeUrl?: string;
  title?: string;
  subtitles?: SubtitleCue[];
  subtitleTracks?: SubtitleTrack[];
}

// 화면 상태 타입 - 여러 boolean을 단일 상태로 통합
type ViewMode =
  | { type: 'menu' }
  | { type: 'tutorial' }
  | { type: 'calibration' }
  | { type: 'chartSelect'; refreshToken?: number; chartStatus?: 'approved' | 'wip' }
  | { type: 'editor' }
  | { type: 'admin' }
  | { type: 'subtitleEditor'; data: SubtitleEditorChartData }
  | { type: 'playing'; isTestMode: boolean; isFromEditor: boolean };

type ChartSelectTransitionState = {
  phase: 'enter' | 'exit';
  refreshToken?: number;
  chartStatus?: 'approved' | 'wip';
};

export const Game: React.FC = () => {
  const renderProfileStart = isGameplayProfilerEnabled() ? performance.now() : 0;
  const [viewMode, setViewMode] = useState<ViewMode>({ type: 'menu' });
  const [chartListRefreshToken, setChartListRefreshToken] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const processedMissNotes = useRef<Set<number>>(new Set());
  const hitNoteIdsRef = useRef<Set<number>>(new Set());
  const chartSelectTransitionTimersRef = useRef<number[]>([]);
  const [chartSelectTransition, setChartSelectTransition] =
    useState<ChartSelectTransitionState | null>(null);
  const [testYoutubeVideoId, setTestYoutubeVideoId] = useState<string | null>(null);
  const [testAudioSettings, setTestAudioSettings] = useState<AudioSettings | null>(null);
  const overlayAudioRef = useRef<HTMLAudioElement | null>(null);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height:
      typeof window !== 'undefined'
        ? window.visualViewport?.height ?? window.innerHeight
        : 1080,
  }));

  // 인증 훅
  const {
    authUser,
    remoteProfile,
    handleLoginWithGoogle,
    handleLogout,
    canEditCharts,
    canSeeAdminMenu,
    currentRoleLabel,
    roleChessIcon,
    isAdmin,
    isModerator,
    userDisplayName: getUserDisplayName,
    ensureEditorAccess,
  } = useAuth();

  // 설정 훅
  const {
    displayName,
    setDisplayName,
    keyBindings,
    noteSpeed,
    setNoteSpeed,
    timingOffsetMs,
    setTimingOffsetMs,
    isBgaEnabled,
    setIsBgaEnabled,
    judgeLineY,
    setJudgeLineY,
    visualSettings,
    draftVisualSettings,
    hasPendingVisualSettings,
    setDraftVisualSettings,
    commitVisualSettings,
    applyPendingVisualSettings,
    applyVisualPreset,
    resetVisualSettings,
    nextDisplayNameChangeAt,
    handleDisplayNameSave,
    handleKeyBindingChange,
    handleResetKeyBindings,
    canChangeDisplayName,
    laneKeyLabels,
    gameVolume,
    setGameVolume,
  } = useGameSettings({
    authUserId: authUser?.id || null,
    remoteProfile,
  });

  const [gameState, setGameState] = useState<GameState>(() => ({
    notes: generateNotes(DEFAULT_GAME_DURATION),
    score: buildInitialScore(),
    currentTime: 0,
    gameStarted: false,
    gameEnded: false,
  }));

  // 게임 뷰 크기 훅
  const { subtitleArea } = useGameViewSize({
    containerRef: gameContainerRef,
  });

  // gameState를 ref로 유지하여 최신 값을 항상 참조
  const gameStateRef = useRef(gameState);
  const currentTimeRef = useRef<number>(0);
  const hasRecordedPlayRef = useRef(false);
  const hasSubmittedScoreRef = useRef(false);
  const audioEndedBeforeChartRef = useRef(false);
  const playSessionRequestChartIdRef = useRef<string | null>(null);
  const [playSessionToken, setPlaySessionToken] = useState<string | null>(null);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const currentChartTimeOffsetMs = testAudioSettings?.startTimeMs ?? 0;
  const currentStartDelayMs = testAudioSettings?.startDelayMs ?? START_DELAY_MS;
  const activePlayableChartId = testAudioSettings?.chartId ?? null;
  const hasYoutubeAudioSession = !!testYoutubeVideoId && !!testAudioSettings;

  useEffect(() => {
    if (!gameState.gameStarted) {
      hasRecordedPlayRef.current = false;
      hasSubmittedScoreRef.current = false;
      playSessionRequestChartIdRef.current = null;
      setPlaySessionToken(null);
      audioEndedBeforeChartRef.current = false;
    }
  }, [gameState.gameStarted]);

  // 현재 게임 시간(ms)을 자막/채보 타임라인 시간(절대 시간)으로 변환
  // 테스트 시작 위치(startTimeMs)를 더해서 절대 시간으로 변환
  // 이렇게 해야 자막/BGA가 올바른 시간에 표시됨
  const currentChartTimeMs = useMemo(
    () => Math.max(0, gameState.currentTime + currentChartTimeOffsetMs),
    [gameState.currentTime, currentChartTimeOffsetMs]
  );

  // BGA 마스크 훅 - 절대 시간 사용
  const {
    setIntervals: setBgaVisibilityIntervals,
    maskOpacity: bgaMaskOpacity,
    isLaneUiVisible,
  } = useBgaMask({
    currentTime: currentChartTimeMs,
    currentTimeRef,
    currentTimeOffsetMs: currentChartTimeOffsetMs,
  });
  const [lanePositionIntervals, setLanePositionIntervals] = useState<LanePositionInterval[]>([]);
  const lanePositionIntervalsRef = useRef<LanePositionInterval[]>([]);

  useEffect(() => {
    lanePositionIntervalsRef.current = lanePositionIntervals;
  }, [lanePositionIntervals]);

  useEffect(() => {
    if (!gameState.gameStarted) {
      setLanePositionIntervals([]);
      lanePositionIntervalsRef.current = [];
    }
  }, [gameState.gameStarted]);

  const activeLanePositionOffsetX = useLanePositionOffset(
    lanePositionIntervals,
    currentTimeRef,
    currentChartTimeOffsetMs,
    gameState.gameStarted && !gameState.gameEnded
  );

  const playfieldGeometry = useMemo(
    () =>
      buildPlayfieldGeometry(
        {
          ...visualSettings,
          laneOffsetX: visualSettings.laneOffsetX + activeLanePositionOffsetX,
        },
        judgeLineY
      ),
    [visualSettings, judgeLineY, activeLanePositionOffsetX]
  );

  useEffect(() => {
    if (hasPendingVisualSettings && (!gameState.gameStarted || gameState.gameEnded)) {
      applyPendingVisualSettings();
    }
  }, [
    hasPendingVisualSettings,
    gameState.gameStarted,
    gameState.gameEnded,
    applyPendingVisualSettings,
  ]);

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);
    window.visualViewport?.addEventListener('resize', updateViewportSize);
    return () => {
      window.removeEventListener('resize', updateViewportSize);
      window.visualViewport?.removeEventListener('resize', updateViewportSize);
    };
  }, []);

  const userDisplayName = getUserDisplayName(displayName);
  const stageScale = useMemo(() => {
    const horizontalPadding = 32;
    const verticalPadding = 32;
    const availableWidth = Math.max(320, viewportSize.width - horizontalPadding);
    const availableHeight = Math.max(320, viewportSize.height - verticalPadding);
    return Math.min(
      availableWidth / GAME_VIEW_WIDTH,
      availableHeight / GAME_VIEW_HEIGHT,
      1
    );
  }, [viewportSize.width, viewportSize.height]);
  const stageDisplayWidth = Math.round(GAME_VIEW_WIDTH * stageScale);
  const stageDisplayHeight = Math.round(GAME_VIEW_HEIGHT * stageScale);
  const [topLaneExtensionHeightPx, setTopLaneExtensionHeightPx] = useState(0);
  const topLaneExtensionHeight = useMemo(
    () =>
      stageScale > 0
        ? Math.max(0, Math.ceil(topLaneExtensionHeightPx / stageScale))
        : 0,
    [topLaneExtensionHeightPx, stageScale]
  );

  useEffect(() => {
    const updateTopLaneExtensionHeight = () => {
      if (!gameContainerRef.current) return;
      const rect = gameContainerRef.current.getBoundingClientRect();
      setTopLaneExtensionHeightPx(Math.max(0, Math.round(rect.top)));
    };

    updateTopLaneExtensionHeight();
    window.addEventListener('resize', updateTopLaneExtensionHeight);
    window.visualViewport?.addEventListener('resize', updateTopLaneExtensionHeight);

    return () => {
      window.removeEventListener('resize', updateTopLaneExtensionHeight);
      window.visualViewport?.removeEventListener('resize', updateTopLaneExtensionHeight);
    };
  }, [stageDisplayWidth, stageDisplayHeight, viewMode.type, gameState.gameStarted, gameState.gameEnded]);

  useEffect(() => {
    if (!isGameplayProfilerEnabled()) return;
    recordGameplayMetric('reactRender', performance.now() - renderProfileStart, 1);
  });

  // speed는 noteSpeed를 사용
  const speed = noteSpeed;

  // 속도가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('rhythmGameSpeed', speed.toString());
  }, [speed]);

  // 자막 훅
  const {
    setSubtitles,
    loadSubtitlesForChart,
    activeSubtitles,
  } = useSubtitles(gameState, currentChartTimeMs, currentTimeRef, currentChartTimeOffsetMs);

  // 테스트 세션 훅
  const {
    isTestMode,
    isFromEditor,
    dynamicGameDuration,
    handleEditorTest,
    handleRetest,
    setIsTestMode,
    setIsFromEditor,
    setDynamicGameDuration,
    preparedNotesRef: testPreparedNotesRef,
    bgaIntervalsRef: testBgaIntervalsRef,
  } = useTestSession({
    setGameState,
    onSubtitlesLoad: loadSubtitlesForChart,
    onSubtitlesSet: setSubtitles,
    onSubtitlesClear: () => setSubtitles([]),
    onBgaIntervalsSet: setBgaVisibilityIntervals,
    onYoutubeVideoIdSet: setTestYoutubeVideoId,
    onAudioSettingsSet: setTestAudioSettings,
    onEditorClose: () => setViewMode({ type: 'menu' }),
    onPressedKeysReset: () => {},
    onHoldingNotesReset: () => {},
    onProcessedMissNotesClear: () => {
      processedMissNotes.current.clear();
      hitNoteIdsRef.current.clear();
    },
  });

  const finishCurrentGame = useCallback(() => {
    setGameState((prev) => (
      prev.gameEnded
        ? prev
        : {
            ...prev,
            score: gameStateRef.current.score,
            currentTime: currentTimeRef.current,
            gameEnded: true,
          }
    ));
  }, []);

  const gameplayActiveForAudio = gameState.gameStarted && !gameState.gameEnded;
  const [isYoutubeAudioMountReady, setIsYoutubeAudioMountReady] = useState(false);
  useEffect(() => {
    if (!gameplayActiveForAudio || !hasYoutubeAudioSession) {
      setIsYoutubeAudioMountReady(false);
      return;
    }

    // Audio iframe must mount during the pre-start lead time. Delaying this made
    // YouTube begin slightly behind the chart on songs with an immediate first beat.
    setIsYoutubeAudioMountReady(true);
  }, [gameplayActiveForAudio, hasYoutubeAudioSession, testYoutubeVideoId]);

  // YouTube 플레이어 훅
  const {
    playerRef: testYoutubePlayerRef,
    isReady: testYoutubePlayerReady,
    pause: pauseYoutubePlayer,
    destroy: destroyYoutubePlayer,
  } = useTestYoutubePlayer({
    audioSessionActive: hasYoutubeAudioSession && gameplayActiveForAudio && isYoutubeAudioMountReady,
    gameStarted: gameState.gameStarted,
    gameEnded: gameState.gameEnded,
    currentTimeRef,
    videoId: testYoutubeVideoId,
    audioSettings: testAudioSettings,
    externalPlayer: null, // 외부 플레이어 재사용 비활성화 - 미리보기 루프 타이머 충돌 방지
    volume: gameVolume,
    performanceMode: visualSettings.performanceMode,
    onPlaybackEnded: () => {
      if (!isFromEditor && currentTimeRef.current >= dynamicGameDuration) {
        finishCurrentGame();
      } else if (!isFromEditor) {
        audioEndedBeforeChartRef.current = true;
      }
    },
  });

  const { resetGameSession } = useGameSessionController({
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
    processedMissNotesRef: processedMissNotes,
    hitNoteIdsRef,
    preparedNotesRef: testPreparedNotesRef,
    bgaIntervalsRef: testBgaIntervalsRef,
    hasRecordedPlayRef,
    hasSubmittedScoreRef,
    playSessionRequestChartIdRef,
  });

  const handleEditorTestWithRuntimeReset = useCallback(
    (payload: Parameters<typeof handleEditorTest>[0]) => {
      const startDelayMs =
        typeof payload.startDelayMs === 'number' && Number.isFinite(payload.startDelayMs)
          ? Math.max(0, Math.round(payload.startDelayMs))
          : START_DELAY_MS;
      if (hasPendingVisualSettings) {
        applyPendingVisualSettings();
      }
      resetGameSession({ currentTime: -startDelayMs });
      const nextLanePositionIntervals = normalizeLanePositionIntervals(
        payload.lanePositionIntervals || []
      );
      setLanePositionIntervals(nextLanePositionIntervals);
      lanePositionIntervalsRef.current = nextLanePositionIntervals;
      window.setTimeout(() => {
        handleEditorTest(payload);
      }, 0);
    },
    [handleEditorTest, resetGameSession, hasPendingVisualSettings, applyPendingVisualSettings]
  );

  const handleRetestWithRuntimeReset = useCallback(() => {
    currentTimeRef.current = -currentStartDelayMs;
    handleRetest();
  }, [currentStartDelayMs, handleRetest]);

  // currentTimeRef is the source time. Use a one-shot timer instead of polling so
  // chart-duration end checks do not add a steady gameplay interval.
  useEffect(() => {
    if (!gameState.gameStarted || gameState.gameEnded) return;

    const remainingMs = Math.max(0, dynamicGameDuration - currentTimeRef.current);
    const timerId = window.setTimeout(() => {
      if (!gameStateRef.current.gameStarted || gameStateRef.current.gameEnded) return;
      const shouldEndByChartDuration =
        isFromEditor || !hasYoutubeAudioSession || !testYoutubeVideoId || audioEndedBeforeChartRef.current;
      if (!shouldEndByChartDuration) return;

      finishCurrentGame();
      if (isFromEditor && hasYoutubeAudioSession && testYoutubePlayerReady) {
        pauseYoutubePlayer();
      }
    }, remainingMs + 20);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    gameState.gameStarted,
    gameState.gameEnded,
    dynamicGameDuration,
    isFromEditor,
    hasYoutubeAudioSession,
    testYoutubeVideoId,
    testYoutubePlayerReady,
    pauseYoutubePlayer,
    finishCurrentGame,
  ]);

  useEffect(() => {
    if (!gameState.gameEnded || !hasYoutubeAudioSession) return;

    pauseYoutubePlayer();
    destroyYoutubePlayer();
  }, [gameState.gameEnded, hasYoutubeAudioSession, pauseYoutubePlayer, destroyYoutubePlayer]);

  useEffect(() => {
    const audio = overlayAudioRef.current;
    const overlayTrack = testAudioSettings?.overlayAudioTrack;
    if (!audio) return;

    if (!overlayTrack || !gameState.gameStarted || gameState.gameEnded) {
      audio.pause();
      if (audio.src) {
        audio.removeAttribute('src');
        audio.load();
      }
      return;
    }

    if (audio.src !== overlayTrack.dataUrl) {
      audio.src = overlayTrack.dataUrl;
      audio.load();
    }

    audio.volume = Math.max(0, Math.min(1, overlayTrack.volume / 100));
    audio.playbackRate = testAudioSettings?.playbackSpeed || 1;

    const syncOverlayTrack = () => {
      const nowMs = currentTimeRef.current;
      const shouldPlay = nowMs >= overlayTrack.offsetMs;
      const desiredSeconds = Math.max(0, (nowMs - overlayTrack.offsetMs) / 1000);

      if (!shouldPlay) {
        if (!audio.paused) {
          audio.pause();
        }
        if (Math.abs(audio.currentTime) > 0.04) {
          audio.currentTime = 0;
        }
        return;
      }

      if (Math.abs(audio.currentTime - desiredSeconds) > 0.12) {
        audio.currentTime = desiredSeconds;
      }

      if (audio.paused) {
        void audio.play().catch(() => {});
      }
    };

    syncOverlayTrack();
    const intervalId = window.setInterval(syncOverlayTrack, 250);

    return () => {
      window.clearInterval(intervalId);
      audio.pause();
    };
  }, [testAudioSettings, gameState.gameStarted, gameState.gameEnded]);

  const resetGame = useCallback(() => {
    resetGameSession({ notes: generateNotes(DEFAULT_GAME_DURATION) });
  }, [resetGameSession]);

  const handleReturnToEditor = useCallback(() => {
    resetGameSession();
    setViewMode({ type: 'editor' });
  }, [resetGameSession]);

  const clearChartSelectTransitionTimers = useCallback(() => {
    chartSelectTransitionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    chartSelectTransitionTimersRef.current = [];
  }, []);

  const openChartSelect = useCallback((refreshToken?: number, chartStatus: 'approved' | 'wip' = 'approved') => {
    clearChartSelectTransitionTimers();

    setChartSelectTransition({ phase: 'enter', refreshToken, chartStatus });

    const exitTimer = window.setTimeout(() => {
      setChartSelectTransition((prev) =>
        prev ? { ...prev, phase: 'exit' } : prev
      );
    }, 520);

    const routeTimer = window.setTimeout(() => {
      chartSelectTransitionTimersRef.current = [];
      setChartSelectTransition(null);
      setViewMode({ type: 'chartSelect', refreshToken, chartStatus });
    }, 680);

    chartSelectTransitionTimersRef.current = [exitTimer, routeTimer];
  }, [clearChartSelectTransitionTimers]);

  const cancelChartSelectTransition = useCallback(() => {
    clearChartSelectTransitionTimers();
    setChartSelectTransition(null);
    setViewMode({ type: 'menu' });
  }, [clearChartSelectTransitionTimers]);

  const handleContributeWipChart = useCallback((chart: ApiChart) => {
    if (!ensureEditorAccess()) return;

    try {
      const parsed = getChartPayload(JSON.parse(chart.data_json || '{}'));
      const draft = {
        ...parsed,
        editingChartId: null,
        chartTitle: parsed.chartTitle ?? chart.title,
        chartAuthor: parsed.chartAuthor ?? chart.author,
        chartDifficulty: parsed.chartDifficulty ?? chart.difficulty ?? 'Normal',
        chartDescription: parsed.chartDescription ?? chart.description ?? '',
        youtubeUrl: parsed.youtubeUrl ?? chart.youtube_url ?? '',
        wip: {
          ...(parsed.wip && typeof parsed.wip === 'object' ? parsed.wip : {}),
          enabled: true,
          parentChartId: parsed.wip?.parentChartId ?? chart.id,
        },
      };
      localStorage.setItem(EDITOR_CONTRIBUTION_DRAFT_KEY, JSON.stringify(draft));
      setViewMode({ type: 'editor' });
    } catch (error) {
      console.error('Failed to prepare WIP contribution:', error);
      alert('이어 만들기용 채보 데이터를 열 수 없습니다.');
    }
  }, [ensureEditorAccess]);

  useEffect(() => {
    return clearChartSelectTransitionTimers;
  }, [clearChartSelectTransitionTimers]);

  // 플레이 목록으로 돌아가기 핸들러
  const handleReturnToPlayList = useCallback(() => {
    resetGameSession();
    const nextRefreshToken = chartListRefreshToken + 1;
    setChartListRefreshToken(nextRefreshToken);
    openChartSelect(nextRefreshToken);
  }, [resetGameSession, chartListRefreshToken, openChartSelect]);

  useEffect(() => {
    if (!gameState.gameStarted || gameState.gameEnded) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFromEditor) {
          handleReturnToEditor();
        } else {
          handleReturnToPlayList();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFromEditor, gameState.gameStarted, gameState.gameEnded, handleReturnToEditor, handleReturnToPlayList]);


  const accuracy = calculateScoreAccuracy(gameState.score);

  useEffect(() => {
    if (!gameState.gameStarted || !gameState.gameEnded || isFromEditor) return;
    if (!activePlayableChartId || !playSessionToken || hasRecordedPlayRef.current) return;

    hasRecordedPlayRef.current = true;
    void retryOnceOnTransientFailure(() => chartAPI.incrementPlayCount(activePlayableChartId, playSessionToken)).catch((error: unknown) => {
      hasRecordedPlayRef.current = false;
      console.error('Failed to increment play count:', error);
    });
  }, [gameState.gameStarted, gameState.gameEnded, isFromEditor, activePlayableChartId, playSessionToken]);

  useEffect(() => {
    if (!gameState.gameStarted || gameState.gameEnded || isFromEditor) return;
    if (!activePlayableChartId) return;
    if (playSessionRequestChartIdRef.current === activePlayableChartId) return;

    playSessionRequestChartIdRef.current = activePlayableChartId;
    setPlaySessionToken(null);

    void retryOnceOnTransientFailure(() => api.createPlaySession(activePlayableChartId))
      .then(({ playSessionToken: token }) => {
        if (playSessionRequestChartIdRef.current === activePlayableChartId) {
          setPlaySessionToken(token);
        }
      })
      .catch((error: any) => {
        if (playSessionRequestChartIdRef.current === activePlayableChartId) {
          playSessionRequestChartIdRef.current = null;
        }
        if (error?.status === 401) {
          console.warn('Leaderboard play session skipped: login required.');
          return;
        }
        console.error('Failed to create leaderboard play session:', error);
      });
  }, [gameState.gameStarted, gameState.gameEnded, isFromEditor, activePlayableChartId]);

  useEffect(() => {
    if (!gameState.gameEnded || isFromEditor) return;
    if (!activePlayableChartId || hasSubmittedScoreRef.current) return;
    if (!playSessionToken) {
      console.warn('Leaderboard score submission skipped: missing play session token.');
      return;
    }

    hasSubmittedScoreRef.current = true;
    const score = gameState.score;
    void retryOnceOnTransientFailure(() => api.submitScore({
        chartId: activePlayableChartId,
        perfect: score.perfect,
        great: score.great,
        good: score.good,
        miss: score.miss,
        maxCombo: score.maxCombo,
        playSessionToken,
      }))
      .then(() => {
        window.dispatchEvent(
          new CustomEvent('userhythm:leaderboard-updated', {
            detail: { chartId: activePlayableChartId },
          })
        );
      })
      .catch((error: any) => {
        hasSubmittedScoreRef.current = false;
        if (error?.status === 401) {
          console.warn('Leaderboard score submission skipped: login required.');
          return;
        }
        console.error('Failed to submit leaderboard score:', error);
      });
  }, [gameState.gameEnded, gameState.score, isFromEditor, activePlayableChartId, playSessionToken]);

  // 채보 저장 핸들러 (현재 미사용)
  // const handleChartSave = useCallback((notes: Note[]) => {
  //   setIsTestMode(false);
  //   testPreparedNotesRef.current = [];
  //   setGameState((prev) => ({
  //     ...prev,
  //     notes: notes.map((note) => ({ ...note, y: 0, hit: false })),
  //   }));
  //   setIsEditorOpen(false);
  // }, []);

  // 에디터 닫기 핸들러
  const handleEditorCancel = useCallback(() => {
    resetGameSession();
    setViewMode({ type: 'menu' });
  }, [resetGameSession]);

  // 채보 로더 훅
  const { loadChart: handleChartSelect } = useChartLoader({
    setGameState,
    onSessionReset: resetGameSession,
    onYoutubeSetup: (videoId, settings) => {
      setTestYoutubeVideoId(videoId);
      setTestAudioSettings(settings);
    },
    onSubtitlesLoad: (chartId) => {
      if (chartId) {
        loadSubtitlesForChart(chartId);
      } else {
        setSubtitles([]);
      }
    },
    onSubtitlesSet: setSubtitles,
    onSubtitlesClear: () => setSubtitles([]),
    onBgaIntervalsSet: setBgaVisibilityIntervals,
    onBgaIntervalsRefSet: (intervals) => { testBgaIntervalsRef.current = intervals; },
    onLanePositionIntervalsSet: (intervals) => {
      setLanePositionIntervals(intervals);
      lanePositionIntervalsRef.current = intervals;
    },
    onDynamicGameDurationSet: setDynamicGameDuration,
    onChartSelectClose: () => setViewMode({ type: 'menu' }),
  });

  // 관리자 테스트 핸들러
  const handleAdminTest = useCallback((chartData: any) => {
    // 관리자 화면을 먼저 닫고, 다음 렌더링 사이클에서 테스트 시작
    setViewMode({ type: 'menu' });
    // 상태 업데이트가 완료된 후 테스트 시작 (다음 틱에서 실행)
      setTimeout(() => {
    handleEditorTestWithRuntimeReset({
        notes: chartData.notes || [],
        startTimeMs: 0,
        youtubeVideoId: chartData.youtubeVideoId || null,
        youtubeUrl: chartData.youtubeUrl || '',
        playbackSpeed: 1,
        audioOffsetMs: typeof chartData.audioOffsetMs === 'number' ? chartData.audioOffsetMs : 0,
        startDelayMs: typeof chartData.startDelayMs === 'number' ? Math.max(0, Math.round(chartData.startDelayMs)) : START_DELAY_MS,
      });
      }, 0);
    }, [handleEditorTestWithRuntimeReset]);

  // Subtitle editor open handler
  const handleOpenSubtitleEditor = useCallback((chartData: SubtitleEditorChartData) => {
    setViewMode({ type: 'subtitleEditor', data: chartData });
  }, []);

  // Subtitle editor close handler
  const handleCloseSubtitleEditor = useCallback(() => {
    setViewMode({ type: 'editor' });
  }, []);

  // --- 디버그: 콘솔 명령으로 에디터 강제 오픈 ---
  useEffect(() => {
    const g = globalThis as any;
    g.__openChartEditor = () => {
      try {
        localStorage.setItem('force-editor', '1');
      } catch {
        /* ignore */
      }
      window.location.reload();
    };
    return () => {
      try {
        delete g.__openChartEditor;
      } catch {
        g.__openChartEditor = undefined;
      }
    };
  }, []);

  // 새로고침 후 에디터 자동 열기 (force-editor 플래그)
  useEffect(() => {
    try {
      const flag = localStorage.getItem('force-editor');
      if (flag === '1') {
        localStorage.removeItem('force-editor');
        setViewMode({ type: 'editor' });
        setIsTestMode(false);
        console.info('[debug] ChartEditor auto-opened via force-editor flag');
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // 테스트 모드 시작 시 viewMode 업데이트
  useEffect(() => {
    if (gameState.gameStarted && !gameState.gameEnded) {
      setViewMode((prev) => {
        if (prev.type === 'playing') return prev;
        return { type: 'playing', isTestMode, isFromEditor };
      });
    } else if (gameState.gameEnded || (!gameState.gameStarted && viewMode.type === 'playing')) {
      // 게임이 끝나거나 시작 전이면 메뉴로 (단, 명시적으로 다른 화면으로 이동한 경우 제외)
      // 이 로직은 게임 종료 화면을 보여주기 위해 조건부로 처리
    }
  }, [isTestMode, gameState.gameStarted, gameState.gameEnded, isFromEditor, viewMode.type]);

  const isChartSelectTransitioning = chartSelectTransition !== null;
  const isGameplayActive = gameState.gameStarted && !gameState.gameEnded;
  const isWaitingForYoutubeAudio =
    isGameplayActive && hasYoutubeAudioSession && (!isYoutubeAudioMountReady || !testYoutubePlayerReady);
  const isGameplayClockRunning = isGameplayActive && !isWaitingForYoutubeAudio;
  const [isBgaTimelineReady, setIsBgaTimelineReady] = useState(false);
  useEffect(() => {
    if (!isGameplayActive || !isGameplayClockRunning) {
      setIsBgaTimelineReady(false);
      return;
    }

    setIsBgaTimelineReady(false);
    let timerId: number | null = null;
    const scheduleBgaStart = () => {
      const remainingMs = Math.max(0, -currentTimeRef.current);
      if (remainingMs <= 0) {
        setIsBgaTimelineReady(true);
        return;
      }

      timerId = window.setTimeout(scheduleBgaStart, Math.max(50, remainingMs));
    };

    scheduleBgaStart();
    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [isGameplayActive, isGameplayClockRunning, currentTimeRef]);
  const backgroundVideoId = isGameplayActive && isBgaTimelineReady ? testYoutubeVideoId : null;
  const shouldPlayBga =
    !!backgroundVideoId &&
    isBgaEnabled &&
    gameState.gameStarted &&
    !gameState.gameEnded &&
    isBgaTimelineReady;
  const activeBgaMaskOpacity = isGameplayActive ? bgaMaskOpacity : 0;
  const activeLaneUiVisible = isGameplayActive ? isLaneUiVisible : true;
  const activeLaneChromeOpacity = activeLaneUiVisible
    ? Math.max(0, Math.min(1, 1 - activeBgaMaskOpacity))
    : 0;
  const activeLaneChromeVisible = activeLaneChromeOpacity > 0.001;
  const gameplayStageBackdropAlpha = 0.16;
  const gameplayStageBorderAlpha = 0.14;
  const gameplayStageShadowAlpha = 0.26;

  // 화면 라우팅은 모든 hooks 계산 이후에 수행해야 한다.
  if (viewMode.type === 'tutorial') {
    return <TutorialScreen onClose={() => setViewMode({ type: 'menu' })} />;
  }

  if (viewMode.type === 'calibration') {
    return (
      <CalibrationGame
        keyBindings={keyBindings}
        currentOffsetMs={timingOffsetMs}
        currentNoteSpeed={noteSpeed}
        onApplyTimingOffset={setTimingOffsetMs}
        onClose={() => setViewMode({ type: 'menu' })}
      />
    );
  }

  if (viewMode.type === 'subtitleEditor') {
    return (
      <SubtitleEditor
        chartId={viewMode.data.chartId}
        chartData={viewMode.data}
        onClose={handleCloseSubtitleEditor}
      />
    );
  }

  if (viewMode.type === 'editor') {
    return (
      <ChartEditor
        onCancel={handleEditorCancel}
        onTest={handleEditorTestWithRuntimeReset}
        onOpenSubtitleEditor={handleOpenSubtitleEditor}
        isAdmin={isAdmin}
      />
    );
  }

  if (viewMode.type === 'chartSelect') {
    return (
      <div className="chart-select-route-in">
        <ChartSelect
          onSelect={handleChartSelect}
          onClose={() => setViewMode({ type: 'menu' })}
          refreshToken={viewMode.refreshToken ?? chartListRefreshToken}
          isAdmin={isAdmin}
          isLoggedIn={!!authUser}
          chartStatus={viewMode.chartStatus ?? 'approved'}
          onContribute={viewMode.chartStatus === 'wip' ? handleContributeWipChart : undefined}
        />
      </div>
    );
  }

  if (viewMode.type === 'admin') {
    return <ChartAdmin onClose={() => setViewMode({ type: 'menu' })} onTestChart={handleAdminTest} />;
  }

  return (
    <>
      <div
        className={`main-to-chart-transition${isChartSelectTransitioning ? ' main-to-chart-transition--active' : ''}`}
        aria-hidden={isChartSelectTransitioning ? true : undefined}
      >
      
      {/* Show FPS HUD only during gameplay */}
      {gameState.gameStarted && !gameState.gameEnded && <FpsHud enabled={true} />}
      {/* Test/play controls (shown outside VideoRhythmLayout, including interlude sections) */}
      {gameState.gameStarted && !gameState.gameEnded && (
        <div
          className="gameplay-control-hud"
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 10000,
            opacity: 1,
            pointerEvents: 'auto',
            transition: 'opacity 40ms linear',
          }}
        >
          {/* 볼륨 조절 */}
          <div
            className="gameplay-volume-control"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              padding: '6px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
            }}
          >
            <span style={{ color: '#fff', fontSize: '14px' }}>
              {gameVolume === 0 ? '🔇' : gameVolume < 50 ? '🔉' : '🔊'}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={gameVolume}
              onChange={(e) => setGameVolume(parseInt(e.target.value, 10))}
              style={{
                width: '80px',
                height: '4px',
                cursor: 'pointer',
                accentColor: CHART_EDITOR_THEME.accent,
              }}
            />
            <span style={{ color: '#fff', fontSize: '12px', minWidth: '28px' }}>
              {gameVolume}%
            </span>
          </div>

          {/* 나가기 버튼 */}
          <button
            className="gameplay-exit-button"
            onClick={isFromEditor ? handleReturnToEditor : handleReturnToPlayList}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: CHART_EDITOR_THEME.danger,
              color: CHART_EDITOR_THEME.textPrimary,
              border: `1px solid ${CHART_EDITOR_THEME.danger}`,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = CHART_EDITOR_THEME.danger;
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ✕ 나가기
          </button>
        </div>
      )}
      
      <VideoRhythmLayout
        videoId={backgroundVideoId}
        bgaEnabled={isBgaEnabled}
        shouldPlayBga={shouldPlayBga}
        bgaCurrentTimeRef={currentTimeRef}
        bgaAudioSettings={testAudioSettings}
        bgaMaskOpacity={activeBgaMaskOpacity}
        bgaOpacity={visualSettings.bgaOpacity}
        performanceMode={visualSettings.performanceMode}
      >
      {/* 메인 메뉴는 500x800 게임 스테이지 바깥에서 화면 전체 기준으로 배치한다. */}
      {!gameState.gameStarted && (
        <GameMenu
          authUser={authUser}
          canEditCharts={canEditCharts}
          canSeeAdminMenu={canSeeAdminMenu}
          userDisplayName={userDisplayName}
          roleChessIcon={roleChessIcon}
          isAdmin={isAdmin}
          isModerator={isModerator}
          onPlay={() => openChartSelect()}
          onWorkInProgress={() => openChartSelect(undefined, 'wip')}
          onEdit={() => setViewMode({ type: 'editor' })}
          onAdmin={() => setViewMode({ type: 'admin' })}
          onTutorial={() => setViewMode({ type: 'tutorial' })}
          onLogin={handleLoginWithGoogle}
          onLogout={handleLogout}
          onSettings={() => setIsSettingsOpen(true)}
          ensureEditorAccess={ensureEditorAccess}
          leftPanel={<MainMenuSidebar type="version" />}
          rightPanel={<MainMenuSidebar type="notice" />}
        />
      )}

      {/* 게임 + 자막 wrapper (자막이 게임 바깥으로 나갈 수 있도록).
          레인 페이드 중에도 자막은 보여야 하므로 wrapper 전체 opacity는 건드리지 않는다. */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <audio ref={overlayAudioRef} preload="auto" style={{ display: 'none' }} />
        <div
          style={{
            position: 'relative',
            width: `${stageDisplayWidth}px`,
            height: `${stageDisplayHeight}px`,
            margin: '0 auto',
            marginTop: 0,
            contain:
              isGameplayActive && activeLaneUiVisible && topLaneExtensionHeightPx > 0
                ? 'layout style'
                : 'layout style paint',
            isolation: 'isolate',
            transform: 'translateZ(0)',
          }}
        >
          <div
            ref={gameContainerRef}
            style={{
              width: '100%',
              height: '100%',
              opacity: isGameplayActive ? activeLaneChromeOpacity : 1,
              pointerEvents: isGameplayActive && !activeLaneChromeVisible ? 'none' : 'auto',
              backgroundColor:
                !activeLaneChromeVisible
                  ? 'transparent'
                  : isGameplayActive
                  ? `rgba(8, 12, 24, ${(gameplayStageBackdropAlpha * activeLaneChromeOpacity).toFixed(3)})`
                  : CHART_EDITOR_THEME.surfaceElevated,
              position: 'relative',
              contain:
                isGameplayActive && activeLaneChromeVisible && topLaneExtensionHeightPx > 0
                  ? 'layout style'
                  : 'layout style paint',
              isolation: 'isolate',
              transform: 'translateZ(0)',
              overflow:
                isGameplayActive && activeLaneChromeVisible && topLaneExtensionHeightPx > 0
                  ? 'visible'
                  : 'hidden',
              borderRadius:
                !activeLaneChromeVisible
                  ? 0
                  : isGameplayActive
                  ? `0 0 ${CHART_EDITOR_THEME.radiusLg} ${CHART_EDITOR_THEME.radiusLg}`
                  : CHART_EDITOR_THEME.radiusLg,
              boxShadow:
                !activeLaneChromeVisible
                  ? 'none'
                  : isGameplayActive
                  ? `0 10px 30px rgba(0, 0, 0, ${(gameplayStageShadowAlpha * activeLaneChromeOpacity).toFixed(3)})`
                  : CHART_EDITOR_THEME.shadowSoft,
              border:
                !activeLaneChromeVisible
                  ? 'none'
                  : isGameplayActive
                  ? `1px solid rgba(238, 247, 242, ${(gameplayStageBorderAlpha * activeLaneChromeOpacity).toFixed(3)})`
                  : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              borderTop:
                isGameplayActive && activeLaneChromeVisible && topLaneExtensionHeightPx > 0
                  ? 'none'
                  : undefined,
              transition: 'opacity 40ms linear, background-color 80ms linear, border 80ms linear, box-shadow 80ms linear, border-radius 80ms linear',
            }}
          >
            {isGameplayActive && activeLaneChromeVisible && topLaneExtensionHeightPx > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: `${-topLaneExtensionHeightPx}px`,
                  width: '100%',
                  height: `${topLaneExtensionHeightPx}px`,
                  pointerEvents: 'none',
                  zIndex: 0,
                  background: `rgba(8, 12, 24, ${(Math.min(0.92, gameplayStageBackdropAlpha + 0.08) * activeLaneChromeOpacity).toFixed(3)})`,
                  borderLeft: `1px solid rgba(238, 247, 242, ${(gameplayStageBorderAlpha * activeLaneChromeOpacity).toFixed(3)})`,
                  borderRight: `1px solid rgba(238, 247, 242, ${(gameplayStageBorderAlpha * activeLaneChromeOpacity).toFixed(3)})`,
                  borderTop: `1px solid rgba(238, 247, 242, ${(gameplayStageBorderAlpha * activeLaneChromeOpacity).toFixed(3)})`,
                }}
              />
            )}
            {isGameplayActive && activeLaneChromeVisible && visualSettings.bgaBlurEnabled && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 1,
                  background: `rgba(8, 12, 24, ${(0.12 * activeLaneChromeOpacity).toFixed(3)})`,
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: `${GAME_VIEW_WIDTH}px`,
                height: `${GAME_VIEW_HEIGHT}px`,
                transform: `scale(${stageScale})`,
                transformOrigin: 'top left',
                zIndex: 2,
                contain: isGameplayActive && activeLaneChromeVisible ? 'layout style' : 'layout style paint',
                isolation: 'isolate',
                overflow: isGameplayActive && activeLaneChromeVisible ? 'visible' : 'hidden',
                willChange: isGameplayActive ? 'transform' : undefined,
              }}
            >
                {isGameplayActive && (
                  <GameplayRuntimeLayer
                    gameState={gameState}
                    gameStateRef={gameStateRef}
                    currentTimeRef={currentTimeRef}
                    setGameState={setGameState}
                    processedMissNotes={processedMissNotes}
                    hitNoteIdsRef={hitNoteIdsRef}
                    keyBindings={keyBindings}
                    laneKeyLabels={laneKeyLabels}
                    noteSpeed={speed}
                    timingOffsetMs={timingOffsetMs}
                    judgeLineY={judgeLineY}
                    playfieldGeometry={playfieldGeometry}
                    playfieldTopOffset={topLaneExtensionHeight}
                    bgaMaskOpacity={activeBgaMaskOpacity}
                    isLaneUiVisible={activeLaneUiVisible}
                    isFromEditor={isFromEditor}
                    isGameplayActive={isGameplayActive}
                    clockEnabled={isGameplayClockRunning}
                    durationMs={dynamicGameDuration}
                    startDelayMs={currentStartDelayMs}
                  />
                )}

                {isWaitingForYoutubeAudio && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0, 0, 0, 0.32)',
                      color: '#f8fafc',
                      fontSize: 18,
                      fontWeight: 800,
                      letterSpacing: 1.5,
                      zIndex: 25,
                      pointerEvents: 'none',
                    }}
                  >
                    YOUTUBE LOADING
                  </div>
                )}

              {/* 게임 종료 UI */}
              {gameState.gameEnded && (
                <GameEndScreen
                  isTestMode={isTestMode}
                  accuracy={accuracy}
                  score={gameState.score}
                  bgaMaskOpacity={activeBgaMaskOpacity}
                  onRetest={isTestMode ? handleRetestWithRuntimeReset : undefined}
                  onReturnToEditor={isFromEditor ? handleReturnToEditor : undefined}
                  onReturnToPlayList={!isFromEditor ? handleReturnToPlayList : undefined}
                  onReset={resetGame}
                />
              )}

      {/* 테스트 모드 YouTube 플레이어 (숨김 - 오디오만 재생) */}
              {isGameplayActive && hasYoutubeAudioSession && testYoutubeVideoId && isYoutubeAudioMountReady && (
                <div
                  ref={testYoutubePlayerRef}
                  style={{
                    position: 'absolute',
                    bottom: '-1000px',
                    left: '-1000px',
                    width: '1px',
                    height: '1px',
                    opacity: 0,
                    pointerEvents: 'none',
                    overflow: 'hidden',
                    zIndex: -1,
                  }}
                />
              )}
            </div>
          </div>
      {/* 자막 레이어 (게임 컨테이너 바깥, 16:9 영역으로 확장)
          레인/BGA 페이드와 자막은 독립 연출이므로 bgaMaskOpacity로 숨기지 않는다. */}
        <LyricOverlay
          activeSubtitles={activeSubtitles}
          subtitleArea={subtitleArea}
          performanceMode={visualSettings.performanceMode}
        />

        </div>
      </div>

      {/* 설정 모달 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        onDisplayNameSave={handleDisplayNameSave}
        canChangeDisplayName={canChangeDisplayName}
        nextDisplayNameChangeAt={nextDisplayNameChangeAt}
        keyBindings={keyBindings}
        onKeyBindingChange={handleKeyBindingChange}
        onResetKeyBindings={handleResetKeyBindings}
        noteSpeed={noteSpeed}
        onNoteSpeedChange={setNoteSpeed}
        timingOffsetMs={timingOffsetMs}
        onTimingOffsetChange={setTimingOffsetMs}
        gameVolume={gameVolume}
        onGameVolumeChange={setGameVolume}
        isBgaEnabled={isBgaEnabled}
        onBgaChange={setIsBgaEnabled}
        judgeLineY={judgeLineY}
        onJudgeLineYChange={setJudgeLineY}
        visualSettings={draftVisualSettings}
        hasPendingVisualSettings={hasPendingVisualSettings}
        isGameplayActive={isGameplayActive}
        onVisualSettingsChange={setDraftVisualSettings}
        onVisualSettingsCommit={commitVisualSettings}
        onApplyVisualPreset={applyVisualPreset}
        onResetVisualSettings={resetVisualSettings}
        onOpenCalibration={() => {
          setIsSettingsOpen(false);
          setViewMode({ type: 'calibration' });
        }}
        currentRoleLabel={currentRoleLabel}
        isLoggedIn={!!authUser}
      />
    </VideoRhythmLayout>
      </div>
      {chartSelectTransition && (
        <ChartSelectTransition
          phase={chartSelectTransition.phase}
          onCancel={cancelChartSelectTransition}
        />
      )}
    </>
  );
};
