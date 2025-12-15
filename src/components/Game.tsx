import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { GameState, Note, SpeedChange } from '../types/game';
import { ChartEditor } from './ChartEditor';
import { ChartSelect } from './ChartSelect';
import { ChartAdmin } from './ChartAdmin';
import { SubtitleEditor } from './SubtitleEditor';
import { SettingsModal } from './SettingsModal';
import { useGameLoop } from '../hooks/useGameLoop';
import { useKeyboard } from '../hooks/useKeyboard';
import { generateNotes } from '../utils/noteGenerator';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { VideoRhythmLayout } from './VideoRhythmLayout';
import { LyricOverlay } from './LyricOverlay';
import { MainMenuSidebar } from './MainMenuSidebar';
import {
  DEFAULT_GAME_DURATION,
  START_DELAY_MS,
} from '../constants/gameConstants';
import { buildInitialScore, getAudioPositionSeconds, AudioSettings } from '../utils/gameHelpers';
import { useAuth } from '../hooks/useAuth';
import { useGameSettings } from '../hooks/useGameSettings';
import { useGameJudging } from '../hooks/useGameJudging';
import { useSubtitles } from '../hooks/useSubtitles';
import { useBgaMask } from '../hooks/useBgaMask';
import { useGameViewSize } from '../hooks/useGameViewSize';
import { useTestYoutubePlayer } from '../hooks/useTestYoutubePlayer';
import { useTestSession } from '../hooks/useTestSession';
import { useChartLoader } from '../hooks/useChartLoader';
import { GameMenu } from './GameMenu';
import { GamePlayArea } from './GamePlayArea';
import { GameEndScreen } from './GameEndScreen';

// Subtitle editor chart data
interface SubtitleEditorChartData {
  chartId: string;
  notes: Note[];
  bpm: number;
  youtubeVideoId?: string | null;
  youtubeUrl?: string;
  title?: string;
}

// 화면 상태 타입 - 여러 boolean을 단일 상태로 통합
type ViewMode =
  | { type: 'menu' }
  | { type: 'chartSelect'; refreshToken?: number }
  | { type: 'editor' }
  | { type: 'admin' }
  | { type: 'subtitleEditor'; data: SubtitleEditorChartData }
  | { type: 'playing'; isTestMode: boolean; isFromEditor: boolean };

export const Game: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>({ type: 'menu' });
  const [chartListRefreshToken, setChartListRefreshToken] = useState<number>(0);
  const [baseBpm, setBaseBpm] = useState<number>(120);
  const [speedChanges, setSpeedChanges] = useState<SpeedChange[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const processedMissNotes = useRef<Set<number>>(new Set());
  const [testYoutubeVideoId, setTestYoutubeVideoId] = useState<string | null>(null);
  const testAudioSettingsRef = useRef<AudioSettings | null>(null);

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
    isBgaEnabled,
    setIsBgaEnabled,
    judgeLineY,
    setJudgeLineY,
    nextDisplayNameChangeAt,
    handleDisplayNameSave,
    handleKeyBindingChange,
    handleResetKeyBindings,
    canChangeDisplayName,
    laneKeyLabels,
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

  // 현재 게임 시간(ms)을 자막/채보 타임라인 시간(절대 시간)으로 변환
  // 테스트 시작 위치(startTimeMs)를 더해서 절대 시간으로 변환
  // 이렇게 해야 자막/BGA가 올바른 시간에 표시됨
  const currentChartTimeMs = useMemo(
    () => Math.max(0, gameState.currentTime + (testAudioSettingsRef.current?.startTimeMs ?? 0)),
    [gameState.currentTime]
  );

  // BGA 마스크 훅 - 절대 시간 사용
  const { setIntervals: setBgaVisibilityIntervals, maskOpacity: bgaMaskOpacity } = useBgaMask({
    currentTime: currentChartTimeMs,
  });

  // gameState를 ref로 유지하여 최신 값을 항상 참조
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // 판정 훅
  const {
    pressedKeys,
    holdingNotes,
    judgeFeedbacks,
    keyEffects,
    handleKeyPress,
    handleKeyRelease,
    handleNoteMiss,
  } = useGameJudging({
    gameState,
    gameStateRef,
    setGameState,
    processedMissNotes,
  });

  // speed는 noteSpeed를 사용
  const speed = noteSpeed;
  const userDisplayName = getUserDisplayName(displayName);


  // 속도가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('rhythmGameSpeed', speed.toString());
  }, [speed]);

  // 키보드 입력 처리
  useKeyboard(
    handleKeyPress,
    handleKeyRelease,
    gameState.gameStarted && !gameState.gameEnded,
    keyBindings
  );

  useGameLoop(gameState, setGameState, handleNoteMiss, speed, START_DELAY_MS);

  // 자막 훅
  const {
    setSubtitles,
    loadSubtitlesForChart,
    activeSubtitles,
  } = useSubtitles(gameState, currentChartTimeMs);

  // 테스트 세션 훅
  const {
    isTestMode,
    isFromEditor,
    dynamicGameDuration,
    handleEditorTest,
    handleRetest,
    reset: resetTestSession,
    setIsTestMode,
    setIsFromEditor,
    setDynamicGameDuration,
    preparedNotesRef: testPreparedNotesRef,
    bgaIntervalsRef: testBgaIntervalsRef,
  } = useTestSession({
    setGameState,
    onSubtitlesLoad: loadSubtitlesForChart,
    onSubtitlesClear: () => setSubtitles([]),
    onBgaIntervalsSet: setBgaVisibilityIntervals,
    onBaseBpmSet: setBaseBpm,
    onSpeedChangesSet: setSpeedChanges,
    onYoutubeVideoIdSet: setTestYoutubeVideoId,
    onAudioSettingsSet: (settings) => { testAudioSettingsRef.current = settings; },
    onEditorClose: () => setViewMode({ type: 'menu' }),
    onPressedKeysReset: () => {},
    onHoldingNotesReset: () => {},
    onProcessedMissNotesClear: () => processedMissNotes.current.clear(),
  });

  // YouTube 플레이어 훅
  const {
    playerRef: testYoutubePlayerRef,
    isReady: testYoutubePlayerReady,
    pause: pauseYoutubePlayer,
    destroy: destroyYoutubePlayer,
  } = useTestYoutubePlayer({
    isTestMode,
    gameStarted: gameState.gameStarted,
    currentTime: gameState.currentTime,
    videoId: testYoutubeVideoId,
    audioSettings: testAudioSettingsRef.current,
  });

  // 게임 종료 체크
  useEffect(() => {
    if (
      gameState.gameStarted &&
      gameState.currentTime >= dynamicGameDuration &&
      !gameState.gameEnded
    ) {
      setGameState((prev) => ({ ...prev, gameEnded: true }));
      
      // 게임 종료 시 YouTube 플레이어 정지
      if (isTestMode && testYoutubePlayerReady) {
        pauseYoutubePlayer();
      }
    }
  }, [gameState.currentTime, gameState.gameStarted, gameState.gameEnded, dynamicGameDuration, isTestMode, testYoutubePlayerReady, pauseYoutubePlayer]);

  const resetGame = useCallback(() => {
    resetTestSession();
    setGameState((prev) => ({
      ...prev,
      notes: generateNotes(DEFAULT_GAME_DURATION),
    }));
  }, [resetTestSession]);

  const handleReturnToEditor = useCallback(() => {
    setViewMode({ type: 'editor' });
    setIsTestMode(false);
    setIsFromEditor(false);
    testAudioSettingsRef.current = null;
    setTestYoutubeVideoId(null);
    setSubtitles([]);
    destroyYoutubePlayer();
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
    }));
  }, [destroyYoutubePlayer, setSubtitles]);

  // 플레이 목록으로 돌아가기 핸들러
  const handleReturnToPlayList = useCallback(() => {
    setIsTestMode(false);
    setIsFromEditor(false);
    testAudioSettingsRef.current = null;
    setTestYoutubeVideoId(null);
    setSubtitles([]);
    destroyYoutubePlayer();
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
      notes: [],
      score: buildInitialScore(),
    }));
    setChartListRefreshToken((prev) => prev + 1);
    setViewMode({ type: 'chartSelect', refreshToken: chartListRefreshToken + 1 });
  }, [destroyYoutubePlayer, setSubtitles, chartListRefreshToken]);

  useEffect(() => {
    if (!isTestMode || !gameState.gameStarted || gameState.gameEnded) return;

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
  }, [isTestMode, isFromEditor, gameState.gameStarted, gameState.gameEnded, handleReturnToEditor, handleReturnToPlayList]);


  const total = gameState.score.perfect + gameState.score.great + 
                gameState.score.good + gameState.score.miss;
  const accuracy =
    total > 0
      ? ((gameState.score.perfect * 100 +
          gameState.score.great * 80 +
          gameState.score.good * 50) /
          (total * 100)) *
        100
      : 0;

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
    setIsTestMode(false);
    setIsFromEditor(false);
    testPreparedNotesRef.current = [];
    testAudioSettingsRef.current = null;
    setTestYoutubeVideoId(null);
    setSubtitles([]);
    destroyYoutubePlayer();
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
      notes: [],
      score: buildInitialScore(),
    }));
    setViewMode({ type: 'menu' });
  }, [destroyYoutubePlayer, setSubtitles]);

  // 채보 로더 훅
  const { loadChart: handleChartSelect } = useChartLoader({
    setGameState,
    onYoutubeDestroy: destroyYoutubePlayer,
    onYoutubeSetup: (videoId, settings) => {
      setTestYoutubeVideoId(videoId);
      testAudioSettingsRef.current = settings;
    },
    onTestModeSet: setIsTestMode,
    onSubtitlesLoad: (chartId) => {
      if (chartId) {
        loadSubtitlesForChart(chartId);
      } else {
        setSubtitles([]);
      }
    },
    onSubtitlesClear: () => setSubtitles([]),
    onBgaIntervalsSet: setBgaVisibilityIntervals,
    onBgaIntervalsRefSet: (intervals) => { testBgaIntervalsRef.current = intervals; },
    onDynamicGameDurationSet: setDynamicGameDuration,
    onBaseBpmSet: setBaseBpm,
    onSpeedChangesSet: setSpeedChanges,
    onHoldingNotesReset: () => {},
    onProcessedMissNotesReset: () => processedMissNotes.current.clear(),
    onChartSelectClose: () => setViewMode({ type: 'menu' }),
  });

  // 관리자 테스트 핸들러
  const handleAdminTest = useCallback((chartData: any) => {
    // 관리자 화면을 먼저 닫고, 다음 렌더링 사이클에서 테스트 시작
    setViewMode({ type: 'menu' });
    // 상태 업데이트가 완료된 후 테스트 시작 (다음 틱에서 실행)
    setTimeout(() => {
    handleEditorTest({
      notes: chartData.notes || [],
      startTimeMs: 0,
      youtubeVideoId: chartData.youtubeVideoId || null,
      youtubeUrl: chartData.youtubeUrl || '',
      playbackSpeed: 1,
      audioOffsetMs: 0,
      bpm: chartData.bpm,
      speedChanges: chartData.speedChanges || [],
    });
    }, 0);
  }, [handleEditorTest]);

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
    if (isTestMode && gameState.gameStarted && !gameState.gameEnded) {
      setViewMode((prev) => {
        if (prev.type === 'playing') return prev;
        return { type: 'playing', isTestMode, isFromEditor };
      });
    } else if (gameState.gameEnded || (!gameState.gameStarted && viewMode.type === 'playing')) {
      // 게임이 끝나거나 시작 전이면 메뉴로 (단, 명시적으로 다른 화면으로 이동한 경우 제외)
      // 이 로직은 게임 종료 화면을 보여주기 위해 조건부로 처리
    }
  }, [isTestMode, gameState.gameStarted, gameState.gameEnded, isFromEditor, viewMode.type]);

  // 화면 라우팅
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
    return <ChartEditor onCancel={handleEditorCancel} onTest={handleEditorTest} onOpenSubtitleEditor={handleOpenSubtitleEditor} />;
  }

  if (viewMode.type === 'chartSelect') {
    return (
      <ChartSelect
        onSelect={handleChartSelect}
        onClose={() => setViewMode({ type: 'menu' })}
        refreshToken={viewMode.refreshToken ?? chartListRefreshToken}
      />
    );
  }

  if (viewMode.type === 'admin') {
    return <ChartAdmin onClose={() => setViewMode({ type: 'menu' })} onTestChart={handleAdminTest} />;
  }

  const backgroundVideoId = testYoutubeVideoId;
  const bgaCurrentSeconds =
    backgroundVideoId && isBgaEnabled
      ? getAudioPositionSeconds(gameState.currentTime, testAudioSettingsRef.current)
      : null;
  const shouldPlayBga =
    !!backgroundVideoId &&
    isBgaEnabled &&
    gameState.gameStarted &&
    !gameState.gameEnded &&
    gameState.currentTime >= 0;

  return (
    <>
      {/* 사이드바는 VideoRhythmLayout 밖에 배치 */}
      {!gameState.gameStarted && (
        <>
          <MainMenuSidebar type="version" position="left" />
          <MainMenuSidebar type="notice" position="right" />
        </>
      )}
      
      {/* 테스트/플레이 중 나가기 버튼 (간주 구간에서도 표시, VideoRhythmLayout 밖에 배치) */}
      {gameState.gameStarted && !gameState.gameEnded && isTestMode && (
        <button
          onClick={isFromEditor ? handleReturnToEditor : handleReturnToPlayList}
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: CHART_EDITOR_THEME.danger,
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.danger}`,
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: 10000, // 모든 레이어 위에 표시
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
      )}
      
      <VideoRhythmLayout
        videoId={backgroundVideoId}
        bgaEnabled={isBgaEnabled}
        shouldPlayBga={shouldPlayBga}
        bgaCurrentSeconds={bgaCurrentSeconds ?? undefined}
        bgaMaskOpacity={bgaMaskOpacity}
      >
      {/* 게임 + 자막 wrapper (자막이 게임 바깥으로 나갈 수 있도록) */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
          opacity: bgaMaskOpacity >= 1 ? 0 : 1,
          transition: 'opacity 80ms linear',
          pointerEvents: bgaMaskOpacity >= 1 ? 'none' : 'auto',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 'min(500px, 100vw - 32px)',
            height: 'min(800px, 100vh - 32px)',
            maxWidth: '500px',
            maxHeight: '800px',
            margin: '0 auto',
            marginTop: 0,
          }}
        >
          <div
            ref={gameContainerRef}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: bgaMaskOpacity >= 1 ? 'transparent' : CHART_EDITOR_THEME.surfaceElevated,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: bgaMaskOpacity >= 1 ? 0 : CHART_EDITOR_THEME.radiusLg,
              boxShadow: bgaMaskOpacity >= 1 ? 'none' : CHART_EDITOR_THEME.shadowSoft,
              border: bgaMaskOpacity >= 1 ? 'none' : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              transition: 'background-color 80ms linear, border 80ms linear, box-shadow 80ms linear, border-radius 80ms linear',
            }}
          >
        <GamePlayArea
          gameState={gameState}
          gameStarted={gameState.gameStarted}
          bgaMaskOpacity={bgaMaskOpacity}
          speed={speed}
          baseBpm={baseBpm}
          speedChanges={speedChanges}
          pressedKeys={pressedKeys}
          holdingNotes={holdingNotes}
          judgeFeedbacks={judgeFeedbacks}
          keyEffects={keyEffects}
          laneKeyLabels={laneKeyLabels}
          isFromEditor={isFromEditor}
        />

        {/* 게임 시작 UI */}
        {!gameState.gameStarted && (
          <GameMenu
            authUser={authUser}
            canEditCharts={canEditCharts}
            canSeeAdminMenu={canSeeAdminMenu}
            userDisplayName={userDisplayName}
            roleChessIcon={roleChessIcon}
            isAdmin={isAdmin}
            isModerator={isModerator}
            onPlay={() => setViewMode({ type: 'chartSelect' })}
            onEdit={() => setViewMode({ type: 'editor' })}
            onAdmin={() => setViewMode({ type: 'admin' })}
            onLogin={handleLoginWithGoogle}
            onLogout={handleLogout}
            onSettings={() => setIsSettingsOpen(true)}
            ensureEditorAccess={ensureEditorAccess}
          />
        )}


        {/* 게임 종료 UI */}
        {gameState.gameEnded && (
          <GameEndScreen
            isTestMode={isTestMode}
            accuracy={accuracy}
            score={gameState.score}
            bgaMaskOpacity={bgaMaskOpacity}
            onRetest={isTestMode ? handleRetest : undefined}
            onReturnToEditor={isFromEditor ? handleReturnToEditor : undefined}
            onReturnToPlayList={!isFromEditor ? handleReturnToPlayList : undefined}
            onReset={resetGame}
          />
        )}
        
        {/* 테스트 모드 YouTube 플레이어 (숨김 - 오디오만 재생) */}
        {isTestMode && testYoutubeVideoId && (
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

      {/* 자막 레이어 (게임 컨테이너 바깥, 16:9 영역으로 확장) - 간주 구간에서는 숨김 */}
      {bgaMaskOpacity < 1 && <LyricOverlay activeSubtitles={activeSubtitles} subtitleArea={subtitleArea} />}
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
        isBgaEnabled={isBgaEnabled}
        onBgaChange={setIsBgaEnabled}
        judgeLineY={judgeLineY}
        onJudgeLineYChange={setJudgeLineY}
        currentRoleLabel={currentRoleLabel}
      />
    </VideoRhythmLayout>
    </>
  );
};
