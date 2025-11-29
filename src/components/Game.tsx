import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { GameState, Note, Lane, JudgeType } from '../types/game';
import { Note as NoteComponent } from './Note';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { Score as ScoreComponent } from './Score';
import { ChartEditor } from './ChartEditor';
import { ChartSelect } from './ChartSelect';
import { ChartAdmin } from './ChartAdmin';
import { SubtitleEditor } from './SubtitleEditor';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGameLoop } from '../hooks/useGameLoop';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { generateNotes } from '../utils/noteGenerator';
import { waitForYouTubeAPI } from '../utils/youtube';
import { SubtitleCue, SubtitleStyle } from '../types/subtitle';
import { subtitleAPI, localSubtitleStorage } from '../lib/subtitleAPI';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

// Subtitle editor chart data
interface SubtitleEditorChartData {
  chartId: string;
  notes: Note[];
  bpm: number;
  youtubeVideoId?: string | null;
  youtubeUrl?: string;
  title?: string;
}

interface EditorTestPayload {
  notes: Note[];
  startTimeMs: number;
  youtubeVideoId: string | null;
  youtubeUrl: string;
  playbackSpeed: number;
  audioOffsetMs?: number;
}

const LANE_KEYS = [
  ['D'],
  ['F'],
  ['J'],
  ['K'],
];

// 4개 레인을 더 붙이도록 배치: 각 레인 100px 너비, 4개 = 400px
// 좌우 여백을 3분의 1로 줄임: (700 - 400) / 2 / 3 = 50px
// 각 레인 중앙: 50 + 50 = 100px, 이후 100px씩 간격
// 판정선: 50px ~ 450px (4개 레인 영역)
const LANE_POSITIONS = [100, 200, 300, 400];
const JUDGE_LINE_LEFT = 50; // 판정선 시작 위치 (첫 레인 왼쪽)
const JUDGE_LINE_WIDTH = 400; // 판정선 너비 (4개 레인 영역)
const JUDGE_LINE_Y = 640;

// 자막 렌더링 영역 (16:9 비율, 4레인 영역 기준)
const SUBTITLE_AREA_LEFT = 50; // 레인 영역과 동일하게 시작
const SUBTITLE_AREA_WIDTH = 400;
const SUBTITLE_AREA_HEIGHT = (SUBTITLE_AREA_WIDTH * 9) / 16; // 16:9 비율
// 자막 영역을 판정선 위쪽에 배치 (노트/판정선과 겹치지 않도록 여유를 둠)
const SUBTITLE_AREA_BOTTOM_MARGIN = 40;
const SUBTITLE_AREA_TOP =
  JUDGE_LINE_Y - SUBTITLE_AREA_BOTTOM_MARGIN - SUBTITLE_AREA_HEIGHT;

const GAME_DURATION = 30000; // 30초
const START_DELAY_MS = 4000;

export const Game: React.FC = () => {
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isChartSelectOpen, setIsChartSelectOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isSubtitleEditorOpen, setIsSubtitleEditorOpen] = useState<boolean>(false);
  const [subtitleEditorData, setSubtitleEditorData] = useState<SubtitleEditorChartData | null>(null);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const testPreparedNotesRef = useRef<Note[]>([]);
  
  // 테스트 모드 YouTube 플레이어 상태
  const [testYoutubePlayer, setTestYoutubePlayer] = useState<any>(null);
  const testYoutubePlayerRef = useRef<HTMLDivElement>(null);
  const testYoutubePlayerReadyRef = useRef(false);
  const [testYoutubeVideoId, setTestYoutubeVideoId] = useState<string | null>(null);
  const testAudioSettingsRef = useRef<{
    youtubeVideoId: string | null;
    youtubeUrl: string;
    startTimeMs: number;
    playbackSpeed: number;
    audioOffsetMs?: number;
  } | null>(null);
  const audioHasStartedRef = useRef(false);
  const [gameState, setGameState] = useState<GameState>(() => ({
    notes: generateNotes(GAME_DURATION),
    score: {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
    },
    currentTime: 0,
    gameStarted: false,
    gameEnded: false,
  }));

  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const [holdingNotes, setHoldingNotes] = useState<Map<number, Note>>(new Map()); // 현재 누르고 있는 롱노트들 (노트 ID -> 노트)
  const [judgeFeedbacks, setJudgeFeedbacks] = useState<Array<{
    id: number;
    judge: JudgeType;
  }>>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<Array<{
    id: number;
    lane: Lane;
    x: number;
    y: number;
  }>>([]);
  const keyEffectIdRef = useRef(0);

  // 자막 상태
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);

  const getAudioBaseSeconds = () => {
    if (!testAudioSettingsRef.current) return 0;
    const { startTimeMs, audioOffsetMs = 0 } = testAudioSettingsRef.current;
    return Math.max(0, (startTimeMs + audioOffsetMs) / 1000);
  };

  const getAudioPositionSeconds = (gameTimeMs: number) => {
    if (!testAudioSettingsRef.current) return 0;
    const { startTimeMs, audioOffsetMs = 0 } = testAudioSettingsRef.current;
    const effectiveTime = Math.max(0, gameTimeMs);
    return Math.max(0, (startTimeMs + audioOffsetMs + effectiveTime) / 1000);
  };
  const processedMissNotes = useRef<Set<number>>(new Set()); // 이미 Miss 처리된 노트 ID 추적
  const buildInitialScore = useCallback(
    () => ({
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
    }),
    []
  );
  
  // localStorage에서 속도 불러오기
  const [speed, setSpeed] = useState<number>(() => {
    const savedSpeed = localStorage.getItem('rhythmGameSpeed');
    return savedSpeed ? parseFloat(savedSpeed) : 1.0;
  });


  // 속도가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('rhythmGameSpeed', speed.toString());
  }, [speed]);

  // gameState를 ref로 유지하여 최신 값을 항상 참조
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const handleKeyPress = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      
      if (!currentState.gameStarted || currentState.gameEnded) return;

      // 키 프레스 상태 업데이트 - 키를 눌렀을 때만 눌린 상태로 변경
      setPressedKeys((prev) => {
        if (prev.has(lane)) return prev; // 이미 누른 키는 업데이트 스킵
        const next = new Set(prev);
        next.add(lane);
        
        // 키를 뗄 때만 짧게 시간 동안 떼어놓음
        setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(lane);
            return next;
          });
        }, 100); // 100ms 후에 키 떼기
        
        return next;
      });

      // 해당 레인에서 가장 가까운 노트 찾기
      const laneNotes = currentState.notes.filter(
        (note) => note.lane === lane && !note.hit
      );

      // 노트가 없으면 아무것도 하지 않음 (성공/실패 판단을 처리 안 함)
      if (laneNotes.length === 0) {
        return;
      }

      const currentTime = currentState.currentTime;
      let bestNote: Note | null = null;
      let bestTimeDiff = Infinity;

      for (const note of laneNotes) {
        const timeDiff = Math.abs(note.time - currentTime);
        if (timeDiff < bestTimeDiff && timeDiff <= 150) {
          bestTimeDiff = timeDiff;
          bestNote = note;
        }
      }

      if (bestNote) {
        const isHoldNote = (bestNote.type === 'hold' || bestNote.duration > 0);
        const judge = judgeTiming(bestNote.time - currentTime);
        
        // 상태 업데이트를 하나로 묶침
        setGameState((prev) => {
          const newScore = { ...prev.score };
          
          switch (judge) {
            case 'perfect':
              newScore.perfect++;
              newScore.combo++;
              break;
            case 'great':
              newScore.great++;
              newScore.combo++;
              break;
            case 'good':
              newScore.good++;
              newScore.combo++;
              break;
            case 'miss':
              newScore.miss++;
              newScore.combo = 0;
              break;
          }

          if (newScore.combo > newScore.maxCombo) {
            newScore.maxCombo = newScore.combo;
          }

          // 롱노트가 아닌 경우에만 hit: true로 설정
          const updatedNotes = isHoldNote
            ? prev.notes
            : prev.notes.map((note) =>
                note.id === bestNote!.id ? { ...note, hit: true } : note
              );

          return {
            ...prev,
            notes: updatedNotes,
            score: newScore,
          };
        });

        // 롱노트인 경우 holdingNotes에 추가
        if (isHoldNote) {
          setHoldingNotes((prev) => {
            const next = new Map(prev);
            next.set(bestNote.id, bestNote);
            return next;
          });
        }

        // 새로운 판정 피드백 추가 - 이전 판정은 제거
        const feedbackId = feedbackIdRef.current++;
        setJudgeFeedbacks([{ id: feedbackId, judge }]);
        
        // 판정선에 이펙트 추가 (miss가 아닐 때만) - 노트가 있는 판정선 위치에서
        if (judge !== 'miss') {
          const effectId = keyEffectIdRef.current++;
          // 노트가 판정선에 있는 위치 (판정선 y 좌표: 640px)
          const effectX = LANE_POSITIONS[lane];
          const effectY = 640; // 판정선 위치
          setKeyEffects((prev) => [...prev, { id: effectId, lane, x: effectX, y: effectY }]);
          
          // 피드백 제거와 이펙트 제거를 requestAnimationFrame으로 처리하여 렌더링 최적화
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
              setKeyEffects((prev) => prev.filter(e => e.id !== effectId));
            }, 800);
          });
        } else {
          // miss인 경우 이펙트 없이 피드백만 제거
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
            }, 800);
          });
        }
      }
      // bestNote가 null이고 laneNotes가 있으면 타이밍이 안 맞는 경우
      // 이 경우에도 Miss 처리를 하지 않음 (성공/실패가 구별이 안 되면 처리 안 함)
    },
    [] // 기존 코드 제거하여 함수 생성을 방지
  );

  const handleKeyRelease = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(lane);
        return next;
      });

      // 해당 레인의 holdingNotes에서 롱노트 찾기
      setHoldingNotes((prev) => {
        const next = new Map(prev);
        const laneHoldNotes = Array.from(prev.values()).filter(
          (note) => note.lane === lane && !note.hit
        );

        for (const holdNote of laneHoldNotes) {
          const currentTime = currentState.currentTime;
          const endTime = typeof holdNote.endTime === 'number' ? holdNote.endTime : holdNote.time + (holdNote.duration || 0);
          const timeDiff = Math.abs(endTime - currentTime);
          // 롱노트 판정 윈도우 사용 (일반 판정보다 여유로움)
          const holdReleaseWindow = judgeConfig.holdReleaseWindows.good;
          const isBeforeEnd = currentTime < endTime - holdReleaseWindow;
          
          if (timeDiff <= holdReleaseWindow) {
            // 롱노트 끝 판정 (롱노트 전용 판정 함수 사용)
            const judge = judgeHoldReleaseTiming(endTime - currentTime);
            
            setGameState((prevState) => {
              const newScore = { ...prevState.score };
              
              switch (judge) {
                case 'perfect':
                  newScore.perfect++;
                  newScore.combo++;
                  break;
                case 'great':
                  newScore.great++;
                  newScore.combo++;
                  break;
                case 'good':
                  newScore.good++;
                  newScore.combo++;
                  break;
                case 'miss':
                  newScore.miss++;
                  newScore.combo = 0;
                  break;
              }

              if (newScore.combo > newScore.maxCombo) {
                newScore.maxCombo = newScore.combo;
              }

              const updatedNotes = prevState.notes.map((note) =>
                note.id === holdNote.id ? { ...note, hit: true } : note
              );

              return {
                ...prevState,
                notes: updatedNotes,
                score: newScore,
              };
            });

            // 판정 피드백 추가
            const feedbackId = feedbackIdRef.current++;
            setJudgeFeedbacks([{ id: feedbackId, judge }]);
            
            if (judge !== 'miss') {
              const effectId = keyEffectIdRef.current++;
              const effectX = LANE_POSITIONS[lane];
              const effectY = 640;
              setKeyEffects((prevEffects) => [...prevEffects, { id: effectId, lane, x: effectX, y: effectY }]);
              
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
                  setKeyEffects((prev) => prev.filter(e => e.id !== effectId));
                }, 800);
              });
            } else {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
                }, 800);
              });
            }

            // holdingNotes에서 제거
            next.delete(holdNote.id);
          } else if (isBeforeEnd) {
            // 롱노트를 충분히 유지하기 전에 손을 뗀 경우 Miss 처리
            processedMissNotes.current.add(holdNote.id);

            setGameState((prevState) => {
              const newScore = { ...prevState.score };
              newScore.miss++;
              newScore.combo = 0;

              const updatedNotes = prevState.notes.map((note) =>
                note.id === holdNote.id ? { ...note, hit: true } : note
              );

              return {
                ...prevState,
                notes: updatedNotes,
                score: newScore,
              };
            });

            const feedbackId = feedbackIdRef.current++;
            setJudgeFeedbacks([{ id: feedbackId, judge: 'miss' }]);
            requestAnimationFrame(() => {
              setTimeout(() => {
                setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
              }, 800);
            });

            next.delete(holdNote.id);
          }
        }

        return next;
      });
    },
    []
  );

  useKeyboard(
    handleKeyPress,
    handleKeyRelease,
    gameState.gameStarted && !gameState.gameEnded
  );

  const handleNoteMiss = useCallback((note: Note) => {
    if (processedMissNotes.current.has(note.id)) {
      return;
    }

    processedMissNotes.current.add(note.id);

    setHoldingNotes((prev) => {
      if (!prev.has(note.id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(note.id);
      return next;
    });
  }, []);

  useGameLoop(gameState, setGameState, handleNoteMiss, speed, START_DELAY_MS);

  // 현재 게임 시간(ms)을 자막/채보 타임라인 시간으로 변환
  const currentChartTimeMs = useMemo(
    () => Math.max(0, gameState.currentTime),
    [gameState.currentTime]
  );

  // 자막 불러오기
  const loadSubtitlesForChart = useCallback(async (chartId: string) => {
    try {
      let cues: SubtitleCue[] = [];

      if (isSupabaseConfigured) {
        cues = await subtitleAPI.getSubtitlesByChartId(chartId);
      } else {
        cues = localSubtitleStorage.get(chartId);
      }

      cues.sort((a, b) => a.startTimeMs - b.startTimeMs);
      setSubtitles(cues);
    } catch (e) {
      console.error('자막을 불러오지 못했습니다:', e);
      setSubtitles([]);
    }
  }, []);

  // 자막 페이드 인/아웃 포함 opacity 계산
  const getSubtitleOpacity = useCallback(
    (cue: SubtitleCue, chartTimeMs: number) => {
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
    },
    []
  );

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
      .filter((x): x is { cue: SubtitleCue; opacity: number } => x !== null);
  }, [subtitles, gameState.gameStarted, currentChartTimeMs, getSubtitleOpacity]);

  useEffect(() => {
    if (
      gameState.gameStarted &&
      gameState.currentTime >= GAME_DURATION &&
      !gameState.gameEnded
    ) {
      setGameState((prev) => ({ ...prev, gameEnded: true }));
      
      // 게임 종료 시 YouTube 플레이어 정지/해제
      if (isTestMode && testYoutubePlayer && testYoutubePlayerReadyRef.current) {
        try {
          testYoutubePlayer.pauseVideo?.();
        } catch (e) {
          console.warn('YouTube 일시정지 실패:', e);
        }
      }
    }
  }, [gameState.currentTime, gameState.gameStarted, gameState.gameEnded, isTestMode, testYoutubePlayer]);

  const resetGame = () => {
    setIsTestMode(false);
    audioHasStartedRef.current = false;
    testPreparedNotesRef.current = [];
    processedMissNotes.current.clear(); // Miss 처리 노트 추적 초기화
    setPressedKeys(new Set());
    setHoldingNotes(new Map()); // 롱노트 상태 초기화
    setSubtitles([]);
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
      notes: generateNotes(GAME_DURATION),
      score: buildInitialScore(),
    }));
  };

  const startTestSession = useCallback(
    (preparedNotes: Note[]) => {
      if (!preparedNotes.length) return;
      audioHasStartedRef.current = false;
      processedMissNotes.current.clear();
      setPressedKeys(new Set());
      setHoldingNotes(new Map()); // 롱노트 상태 초기화
      setGameState((prev) => ({
        ...prev,
        gameStarted: true,
        notes: preparedNotes.map((note, index) => ({
          ...note,
          id: index + 1,
          y: 0,
          hit: false,
        })),
        score: buildInitialScore(),
        currentTime: -START_DELAY_MS,
        gameEnded: false,
      }));
    },
    [buildInitialScore]
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
      testAudioSettingsRef.current = {
        youtubeVideoId: payload.youtubeVideoId,
        youtubeUrl: payload.youtubeUrl,
        startTimeMs: startMs,
        playbackSpeed: payload.playbackSpeed || 1,
        audioOffsetMs: payload.audioOffsetMs ?? 0,
      };

      testPreparedNotesRef.current = preparedNotes.map((note) => ({ ...note }));
      setIsTestMode(true);
      setIsEditorOpen(false);
      
      // YouTube 플레이어 초기화를 위해 videoId 설정
      if (payload.youtubeVideoId) {
        setTestYoutubeVideoId(payload.youtubeVideoId);
      } else {
        setTestYoutubeVideoId(null);
      }
      
      startTestSession(preparedNotes);
    },
    [startTestSession]
  );

  const handleRetest = useCallback(() => {
    if (!testPreparedNotesRef.current.length) return;
    setIsTestMode(true);
    const clonedNotes = testPreparedNotesRef.current.map((note) => ({ ...note }));
    startTestSession(clonedNotes);
  }, [startTestSession]);

  const handleReturnToEditor = useCallback(() => {
    setIsEditorOpen(true);
    setIsTestMode(false);
    audioHasStartedRef.current = false;
    testPreparedNotesRef.current = [];
    testAudioSettingsRef.current = null;
    setTestYoutubeVideoId(null);
    setSubtitles([]);
    
    // YouTube 플레이어 정리
    if (testYoutubePlayer) {
      try {
        testYoutubePlayer.destroy();
      } catch (e) {
        console.warn('테스트 플레이어 정리 실패:', e);
      }
    }
    setTestYoutubePlayer(null);
    testYoutubePlayerReadyRef.current = false;
    
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
    }));
  }, [testYoutubePlayer]);

  // ESC 키로 테스트 모드 나가기
  useEffect(() => {
    if (!isTestMode || !gameState.gameStarted || gameState.gameEnded) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleReturnToEditor();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isTestMode, gameState.gameStarted, gameState.gameEnded, handleReturnToEditor]);

  // 테스트 모드 YouTube 플레이어 초기화
  useEffect(() => {
    if (!isTestMode || !testYoutubeVideoId) return;
    if (!testYoutubePlayerRef.current) return;

    let playerInstance: any = null;
    let isCancelled = false;

    const cleanup = (player: any) => {
      if (player) {
        try {
          if (typeof player.destroy === 'function') {
            player.destroy();
          }
        } catch (e) {
          console.warn('테스트 플레이어 정리 실패:', e);
        }
      }
      setTestYoutubePlayer(null);
      testYoutubePlayerReadyRef.current = false;
    };

    // 기존 플레이어 정리
    setTestYoutubePlayer((currentPlayer: any) => {
      if (currentPlayer) {
        cleanup(currentPlayer);
      }
      return null;
    });
    testYoutubePlayerReadyRef.current = false;

    waitForYouTubeAPI().then(() => {
      if (isCancelled) return;

      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame API를 로드하지 못했습니다.');
        return;
      }

      const playerElement = testYoutubePlayerRef.current;
      if (!playerElement || isCancelled) return;

      const videoId = testYoutubeVideoId;
      if (!videoId) return;

      const playerId = `test-youtube-player-${videoId}`;
      if (playerElement.id !== playerId) {
        playerElement.id = playerId;
      }

      try {
        playerInstance = new window.YT.Player(playerElement.id, {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          } as any,
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;

              const player = event.target;
              testYoutubePlayerReadyRef.current = true;
              setTestYoutubePlayer(player);
              playerInstance = player;

              console.log('✅ 테스트 YouTube 플레이어 준비 완료');
              
              // 플레이어가 준비되면 설정만 하고, 실제 재생은 게임 시작 후에 수행
              setTimeout(() => {
                if (!isCancelled && player && testAudioSettingsRef.current) {
                  try {
                    const { playbackSpeed } = testAudioSettingsRef.current;
                    const startTimeSec = getAudioBaseSeconds();
                    
                    // 재생 속도 설정
                    player.setPlaybackRate?.(playbackSpeed);
                    
                    // 시작 위치로 이동 (미리 이동)
                    player.seekTo(startTimeSec, true);
                    
                    console.log(`🎵 YouTube 플레이어 준비 완료 (${startTimeSec}초, ${playbackSpeed}x) - 게임 시작 후 재생`);
                  } catch (e) {
                    console.warn('YouTube 플레이어 설정 실패:', e);
                  }
                }
              }, 100);
            },
          },
        });
      } catch (e) {
        console.error('테스트 플레이어 생성 실패:', e);
      }
    });

    return () => {
      isCancelled = true;
      if (playerInstance) {
        cleanup(playerInstance);
      }
    };
  }, [isTestMode, testYoutubeVideoId]);

  // Test mode YouTube audio sync
  useEffect(() => {
    if (!isTestMode || !gameState.gameStarted) return;
    if (!testYoutubePlayer || !testYoutubePlayerReadyRef.current) return;
    if (!testAudioSettingsRef.current) return;

    const { playbackSpeed } = testAudioSettingsRef.current;

    try {
      testYoutubePlayer.setPlaybackRate?.(playbackSpeed);
    } catch (e) {
      console.warn("YouTube playback speed update failed:", e);
    }

    const cueSeconds = getAudioBaseSeconds();

    if (gameState.currentTime < 0) {
      audioHasStartedRef.current = false;
      try {
        testYoutubePlayer.pauseVideo?.();
        testYoutubePlayer.seekTo(cueSeconds, true);
      } catch (e) {
        console.warn("YouTube cueing failed:", e);
      }
      return;
    }

    if (!audioHasStartedRef.current) {
      try {
        testYoutubePlayer.seekTo(cueSeconds, true);
        testYoutubePlayer.playVideo?.();
        audioHasStartedRef.current = true;
        console.log(`YouTube test playback start (${cueSeconds.toFixed(2)}s)`);
      } catch (e) {
        console.warn("YouTube initial playback failed:", e);
      }
      return;
    }

    const desiredSeconds = getAudioPositionSeconds(gameState.currentTime);
    const currentSeconds = testYoutubePlayer.getCurrentTime?.() ?? 0;

    if (Math.abs(currentSeconds - desiredSeconds) > 0.15) {
      try {
        testYoutubePlayer.seekTo(desiredSeconds, true);
        console.log(`YouTube resync: ${desiredSeconds.toFixed(2)}s`);
      } catch (e) {
        console.warn("YouTube resync failed:", e);
      }
    }
  }, [isTestMode, gameState.gameStarted, gameState.currentTime, testYoutubePlayer]);

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

  // 채보 저장 핸들러
  const handleChartSave = useCallback((notes: Note[]) => {
    setIsTestMode(false);
    testPreparedNotesRef.current = [];
    setGameState((prev) => ({
      ...prev,
      notes: notes.map((note) => ({ ...note, y: 0, hit: false })),
    }));
    setIsEditorOpen(false);
  }, []);

  // 에디터 닫기 핸들러
  const handleEditorCancel = useCallback(() => {
    setIsTestMode(false);
    testPreparedNotesRef.current = [];
    setIsEditorOpen(false);
  }, []);

  // 채보 선택 핸들러
  const handleChartSelect = useCallback((chartData: any) => {
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

      setIsChartSelectOpen(false);
      
      // 기존 테스트 모드 플레이어 정리
      if (testYoutubePlayer) {
        try {
          testYoutubePlayer.destroy?.();
        } catch (e) {
          console.warn('기존 플레이어 정리 실패:', e);
        }
      }
      setTestYoutubePlayer(null);
      testYoutubePlayerReadyRef.current = false;
      
      // YouTube 플레이어 설정 (필요시) - 먼저 설정해야 useEffect가 올바르게 작동함
      if (chartData.youtubeVideoId) {
        testAudioSettingsRef.current = {
          youtubeVideoId: chartData.youtubeVideoId,
          youtubeUrl: chartData.youtubeUrl || '',
          startTimeMs: 0,
          playbackSpeed: 1,
        };
        setTestYoutubeVideoId(chartData.youtubeVideoId); // state로 설정하여 useEffect가 감지하도록
        setIsTestMode(true);
      } else {
        setIsTestMode(false);
        setTestYoutubeVideoId(null);
        testAudioSettingsRef.current = null;
      }
      
      // 선택된 채보 데이터로 게임 상태 초기화
      const preparedNotes = chartData.notes.map((note: Note) => ({
        ...note,
        y: 0,
        hit: false,
      }));
      
      if (preparedNotes.length === 0) {
        alert('이 채보에는 노트가 없습니다.');
        return;
      }
      
      setGameState({
        notes: preparedNotes,
        score: buildInitialScore(),
        currentTime: -START_DELAY_MS,
        gameStarted: true,
        gameEnded: false,
      });
      
      setHoldingNotes(new Map());
      processedMissNotes.current = new Set();

      // 자막 로드 (chartId가 있을 때만)
      if (chartData.chartId) {
        loadSubtitlesForChart(chartData.chartId);
      } else {
        setSubtitles([]);
      }
    } catch (error) {
      console.error('Failed to load chart:', error);
      alert('채보를 불러오는데 실패했습니다. 다시 시도해주세요.');
    }
  }, [buildInitialScore, loadSubtitlesForChart]);

  // 관리자 테스트 핸들러
  const handleAdminTest = useCallback((chartData: any) => {
    // 관리자 화면을 먼저 닫고, 다음 렌더링 사이클에서 테스트 시작
    setIsAdminOpen(false);
    // 상태 업데이트가 완료된 후 테스트 시작 (다음 틱에서 실행)
    setTimeout(() => {
    handleEditorTest({
      notes: chartData.notes || [],
      startTimeMs: 0,
      youtubeVideoId: chartData.youtubeVideoId || null,
      youtubeUrl: chartData.youtubeUrl || '',
      playbackSpeed: 1,
      audioOffsetMs: 0,
    });
    }, 0);
  }, [handleEditorTest]);

  // Subtitle editor open handler
  const handleOpenSubtitleEditor = useCallback((chartData: SubtitleEditorChartData) => {
    setSubtitleEditorData(chartData);
    setIsSubtitleEditorOpen(true);
    setIsEditorOpen(false);
  }, []);

  // Subtitle editor close handler
  const handleCloseSubtitleEditor = useCallback(() => {
    setIsSubtitleEditorOpen(false);
    setSubtitleEditorData(null);
    setIsEditorOpen(true);
  }, []);

  // Show subtitle editor if open
  if (isSubtitleEditorOpen && subtitleEditorData) {
    return (
      <SubtitleEditor
        chartId={subtitleEditorData.chartId}
        chartData={subtitleEditorData}
        onClose={handleCloseSubtitleEditor}
      />
    );
  }

  // 에디터가 열려있으면 에디터만 표시
  if (isEditorOpen) {
    return <ChartEditor onSave={handleChartSave} onCancel={handleEditorCancel} onTest={handleEditorTest} onOpenSubtitleEditor={handleOpenSubtitleEditor} />;
  }

  // 채보 선택 화면
  if (isChartSelectOpen) {
    return <ChartSelect onSelect={handleChartSelect} onClose={() => setIsChartSelectOpen(false)} />;
  }

  // 관리자 화면
  if (isAdminOpen) {
    return <ChartAdmin onClose={() => setIsAdminOpen(false)} onTestChart={handleAdminTest} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: CHART_EDITOR_THEME.backgroundGradient,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '500px', // 좌우 여백을 3분의 1로 줄임: 700px - 400px = 300px -> 100px
          height: '800px',
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          boxShadow: CHART_EDITOR_THEME.shadowSoft,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        {/* 4개 레인 영역 배경 */}
        <div
          style={{
            position: 'absolute',
            left: '50px',
            top: '0',
            width: '400px',
            height: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.6)', // 네온 톤의 남색 계열
          }}
        />
        
        {/* 배경 라인 구분선 - 레인 사이 경계와 양쪽 끝 */}
        {[50, 150, 250, 350, 450].map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: '0',
              width: '2px',
              height: '100%',
              backgroundColor: 'rgba(255,255,255,0.1)',
              transform: 'translateX(-50%)',
            }}
          />
        ))}

        {/* 노트 렌더링 */}
        {gameState.notes.map((note) => (
          <NoteComponent
            key={note.id}
            note={note}
            fallDuration={2000 / speed}
            currentTime={gameState.currentTime}
            judgeLineY={JUDGE_LINE_Y}
            laneX={LANE_POSITIONS[note.lane]}
            isHolding={holdingNotes.has(note.id)}
          />
        ))}

        {/* 자막 렌더링 (16:9 영역, 노트 위 레이어) */}
        {activeSubtitles.map(({ cue, opacity }) => {
          const style = cue.style || ({} as SubtitleStyle);
          const pos = style.position ?? { x: 0.5, y: 0.9 };

          const left =
            SUBTITLE_AREA_LEFT + pos.x * SUBTITLE_AREA_WIDTH;
          const top =
            SUBTITLE_AREA_TOP + pos.y * SUBTITLE_AREA_HEIGHT;

          const transformParts: string[] = ['translate(-50%, -50%)'];
          if (style.rotationDeg) {
            transformParts.push(`rotate(${style.rotationDeg}deg)`);
          }

          const textAlign = style.textAlign ?? 'center';
          const baseOpacity = style.backgroundOpacity ?? 0.9;
          const displayOpacity = baseOpacity * opacity;

          const backgroundColor =
            style.backgroundColor ?? 'rgba(0, 0, 0, 0.9)';

          return (
            <div
              key={cue.id}
              style={{
                position: 'absolute',
                left,
                top,
                transform: transformParts.join(' '),
                transformOrigin: '50% 50%',
                padding: '6px 14px',
                borderRadius: 8,
                backgroundColor,
                opacity: displayOpacity,
                color: style.color ?? '#ffffff',
                fontFamily: style.fontFamily ?? 'Noto Sans KR, sans-serif',
                fontSize: style.fontSize ?? 24,
                fontWeight: style.fontWeight ?? 'normal',
                fontStyle: style.fontStyle ?? 'normal',
                textAlign,
                whiteSpace: 'pre-wrap',
                pointerEvents: 'none',
                zIndex: 300,
                boxShadow:
                  '0 10px 30px rgba(0,0,0,0.9), 0 0 18px rgba(15,23,42,0.9)',
                border: style.outlineColor
                  ? `1px solid ${style.outlineColor}`
                  : 'none',
              }}
            >
              {cue.text.split('\n').map((line, idx, arr) => (
                <React.Fragment key={idx}>
                  {line}
                  {idx < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          );
        })}

        {/* 판정선 - 게임 중에만 표시 (4개 레인 영역에만) */}
        {gameState.gameStarted && (
          <JudgeLine left={JUDGE_LINE_LEFT} width={JUDGE_LINE_WIDTH} />
        )}

        {/* 4개 레인 - 게임 중에만 표시 */}
        {gameState.gameStarted &&
          LANE_POSITIONS.map((x, index) => (
            <KeyLane
              key={index}
              x={x}
              keys={LANE_KEYS[index]}
              isPressed={pressedKeys.has(index as Lane)}
            />
          ))}

        {/* 판정선에 나오는 이펙트 - 노트가 있는 위치에서 (게임 중에만 표시) */}
        {gameState.gameStarted &&
          keyEffects.map((effect) => (
            <div
              key={effect.id}
              style={{
                position: 'absolute',
                left: `${effect.x}px`,
                top: `${effect.y}px`,
                transform: 'translate(-50%, -50%)',
                width: '120px',
                height: '120px',
                pointerEvents: 'none',
                zIndex: 500,
              }}
            >
              {/* 파티클 이펙트 */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100%',
                  height: '100%',
                  animation: 'keyEffectRipple 0.6s ease-out forwards',
                  borderRadius: '50%',
                  border: '3px solid rgba(255, 255, 255, 0.8)',
                  boxShadow: '0 0 20px rgba(255, 255, 255, 0.6), 0 0 40px rgba(255, 255, 255, 0.4)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '80%',
                  height: '80%',
                  animation: 'keyEffectRipple 0.6s 0.1s ease-out forwards',
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 255, 255, 0.6)',
                  boxShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
                }}
              />
              {/* 사방으로 날아가는 파티클 */}
              {[...Array(8)].map((_, i) => {
                const angle = (i * 360) / 8;
                const radians = (angle * Math.PI) / 180;
                const distance = 40;
                const x = Math.cos(radians) * distance;
                const y = Math.sin(radians) * distance - 40; // 위로 좀 날아가도록
                
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      boxShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
                      animation: `keyEffectParticle 0.6s ease-out forwards`,
                      animationDelay: `${i * 0.05}s`,
                      '--end-x': `${x}px`,
                      '--end-y': `${y}px`,
                    } as React.CSSProperties & { '--end-x': string; '--end-y': string }}
                  />
                );
              })}
            </div>
          ))}

        {/* 판정 피드백 - 4개 레인 영역 중앙에 통합 표시 (개별 애니메이션) */}
        {judgeFeedbacks.map((feedback) => 
          feedback.judge ? (
            <div
              key={feedback.id}
              style={{
                position: 'absolute',
                left: '50%',
                top: '500px',
                transform: 'translateX(-50%)',
                fontSize: '48px',
                fontWeight: 'bold',
                color:
                  feedback.judge === 'perfect'
                    ? '#FFD700'
                    : feedback.judge === 'great'
                    ? '#00FF00'
                    : feedback.judge === 'good'
                    ? '#00BFFF'
                    : '#FF4500',
                textShadow: '0 0 20px rgba(255,255,255,0.9), 0 0 40px currentColor',
                animation: 'judgePopUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                zIndex: 1000 + feedback.id,
                pointerEvents: 'none',
              }}
            >
              {feedback.judge.toUpperCase()}
            </div>
          ) : null
        )}

        {/* 점수 - 게임 중에만 표시 */}
        {gameState.gameStarted && <ScoreComponent score={gameState.score} />}

        {/* 테스트 모드 중 나가기 버튼 */}
        {gameState.gameStarted && !gameState.gameEnded && isTestMode && (
          <button
            onClick={handleReturnToEditor}
            style={{
              position: 'absolute',
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
              zIndex: 1000,
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

        {/* 게임 시작/종료 UI */}
        {!gameState.gameStarted && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#fff',
              width: '90%',
              maxWidth: '600px',
            }}
          >
            {/* 첫 화면 표시 */}
            <h1 
              style={{ 
                fontSize: '50px', 
                marginBottom: '24px', 
                marginTop: '-40px',
                fontWeight: '900',
                fontStyle: 'italic',
                letterSpacing: '2px', // 4px에서 2px로 줄임
                background: CHART_EDITOR_THEME.titleGradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                WebkitTextStroke: `3px ${CHART_EDITOR_THEME.rootBackground}`, // 텍스트 테두리
                textShadow: CHART_EDITOR_THEME.titleGlow,
                fontFamily: 'Arial Black, sans-serif',
                textTransform: 'uppercase',
                lineHeight: '1.1',
              }}
            >
               UseRhythm
            </h1>
            <p style={{ fontSize: '18px', marginBottom: '48px', color: CHART_EDITOR_THEME.textSecondary }}>
              누구나 리듬게임 채보를 만들고 공유하세요
            </p>

            {/* 메인 메뉴 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginBottom: '48px',
              }}
            >
              <button
                style={{
                  padding: '20px 40px',
                  fontSize: '22px',
                  background: CHART_EDITOR_THEME.ctaButtonGradient,
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                  borderRadius: CHART_EDITOR_THEME.radiusLg,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
                }}
                onClick={() => {
                  setIsChartSelectOpen(true);
                }}
              >
                ▶️ 플레이
              </button>

              <button
                style={{
                  padding: '20px 40px',
                  fontSize: '22px',
                  background: CHART_EDITOR_THEME.ctaButtonGradient,
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                  borderRadius: CHART_EDITOR_THEME.radiusLg,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
                }}
                onClick={() => {
                  setIsEditorOpen(true);
                }}
              >
                ✏️ 채보 만들기
              </button>

              <button
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  background: CHART_EDITOR_THEME.ctaButtonGradient,
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
                }}
                onClick={() => {
                  setIsAdminOpen(true);
                }}
              >
                🔐 관리자
              </button>
            </div>


            {/* 설정 */}
            <div
              style={{
                backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                padding: CHART_EDITOR_THEME.paddingLg,
                borderRadius: CHART_EDITOR_THEME.radiusLg,
                marginTop: '16px',
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
              }}
            >
              <h3 style={{ 
                fontSize: '20px', 
                marginBottom: '20px', 
                fontWeight: 'bold',
                color: CHART_EDITOR_THEME.textPrimary,
              }}>
                ⚙️ 게임 설정
              </h3>
              
              {/* 속도 조절 슬라이더 */}
              <div
                style={{
                  marginBottom: '16px',
                  color: CHART_EDITOR_THEME.textPrimary,
                }}
              >
                <label
                  style={{
                    display: 'block',
                    fontSize: '16px',
                    marginBottom: '12px',
                    fontWeight: '500',
                    color: CHART_EDITOR_THEME.textPrimary,
                  }}
                >
                  노트 속도: {speed.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="10.0"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '4px',
                    outline: 'none',
                    backgroundColor: CHART_EDITOR_THEME.surface,
                    cursor: 'pointer',
                    accentColor: CHART_EDITOR_THEME.accent,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginTop: '8px',
                    color: CHART_EDITOR_THEME.textSecondary,
                  }}
                >
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>5.0x</span>
                  <span>10.0x</span>
                </div>
              </div>

              <div style={{ 
                fontSize: '14px', 
                color: CHART_EDITOR_THEME.textSecondary, 
                marginTop: '16px' 
              }}>
                키 조작키: D, F, J, K 키를 사용하세요
              </div>
            </div>
          </div>
        )}

        {gameState.gameEnded && (
          isTestMode ? (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: CHART_EDITOR_THEME.textPrimary,
                backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                padding: '32px',
                borderRadius: CHART_EDITOR_THEME.radiusLg,
                minWidth: '360px',
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
              }}
            >
              <h1 style={{ 
                fontSize: '40px', 
                marginBottom: '20px',
                color: CHART_EDITOR_THEME.textPrimary,
              }}>
                테스트 종료
              </h1>
              <div style={{ 
                fontSize: '20px', 
                marginBottom: '28px',
                color: CHART_EDITOR_THEME.textSecondary,
              }}>
                <div>정확도: {accuracy.toFixed(2)}%</div>
                <div>최대 콤보: {gameState.score.maxCombo}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={handleRetest}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    background: CHART_EDITOR_THEME.ctaButtonGradient,
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🔁 다시 테스트
                </button>
                <button
                  onClick={handleReturnToEditor}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    background: CHART_EDITOR_THEME.ctaButtonGradient,
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  ✏️ 에디터로 돌아가기
                </button>
                <button
                  onClick={resetGame}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    background: 'transparent',
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.surface;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🏠 메인 메뉴
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: CHART_EDITOR_THEME.textPrimary,
                backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                padding: '32px',
                borderRadius: CHART_EDITOR_THEME.radiusLg,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
              }}
            >
              <h1 style={{ 
                fontSize: '48px', 
                marginBottom: '32px',
                color: CHART_EDITOR_THEME.textPrimary,
              }}>
                게임 종료
              </h1>
              <div style={{ 
                fontSize: '24px', 
                marginBottom: '32px',
                color: CHART_EDITOR_THEME.textSecondary,
              }}>
                <div>최대 콤보: {gameState.score.maxCombo}</div>
                <div>정확도: {accuracy.toFixed(2)}%</div>
              </div>
              <button
                onClick={resetGame}
                style={{
                  padding: '16px 32px',
                  fontSize: '24px',
                  background: CHART_EDITOR_THEME.ctaButtonGradient,
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                다시 시작
              </button>
            </div>
          )
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
    </div>
  );
};
