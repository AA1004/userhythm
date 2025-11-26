import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Note, Lane, JudgeType } from '../types/game';
import { Note as NoteComponent } from './Note';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { Score as ScoreComponent } from './Score';
import { ChartEditor } from './ChartEditor';
import { ChartSelect } from './ChartSelect';
import { ChartAdmin } from './ChartAdmin';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGameLoop } from '../hooks/useGameLoop';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { generateNotes } from '../utils/noteGenerator';
import { waitForYouTubeAPI } from '../utils/youtube';

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

// 4ê°??ˆì¸????ë¶™ì´?„ë¡ ë°°ì¹˜: ê°??ˆì¸ 100px ?ˆë¹„, 4ê°?= 400px
// ì¢Œìš° ?¬ë°±??3ë¶„ì˜ 1ë¡?ì¤„ì„: (700 - 400) / 2 / 3 = 50px
// ê°??ˆì¸ ì¤‘ì•™: 50 + 50 = 100px, ?´í›„ 100px??ê°„ê²©
// ?ì •?? 50px ~ 450px (4ê°??ˆì¸ ?ì—­)
const LANE_POSITIONS = [100, 200, 300, 400];
const JUDGE_LINE_LEFT = 50; // ?ì •???œì‘ ?„ì¹˜ (ì²??ˆì¸ ?¼ìª½)
const JUDGE_LINE_WIDTH = 400; // ?ì •???ˆë¹„ (4ê°??ˆì¸ ?ì—­)
const JUDGE_LINE_Y = 640;

const GAME_DURATION = 30000; // 30ì´?
const START_DELAY_MS = 4000;

export const Game: React.FC = () => {
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isChartSelectOpen, setIsChartSelectOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const testPreparedNotesRef = useRef<Note[]>([]);
  
  // ?ŒìŠ¤??ëª¨ë“œ YouTube ?Œë ˆ?´ì–´ ?íƒœ
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
  const [holdingNotes, setHoldingNotes] = useState<Map<number, Note>>(new Map()); // ?„ì¬ ?„ë¥´ê³??ˆëŠ” ë¡±ë…¸?¸ë“¤ (?¸íŠ¸ ID -> ?¸íŠ¸)
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
  const processedMissNotes = useRef<Set<number>>(new Set()); // ?´ë? Miss ì²˜ë¦¬???¸íŠ¸ ID ì¶”ì 
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
  
  // localStorage?ì„œ ?ë„ ë¶ˆëŸ¬?¤ê¸°
  const [speed, setSpeed] = useState<number>(() => {
    const savedSpeed = localStorage.getItem('rhythmGameSpeed');
    return savedSpeed ? parseFloat(savedSpeed) : 1.0;
  });


  // ?ë„ê°€ ë³€ê²½ë  ?Œë§ˆ??localStorage???€??
  useEffect(() => {
    localStorage.setItem('rhythmGameSpeed', speed.toString());
  }, [speed]);

  // gameStateë¥?refë¡?? ì??˜ì—¬ ìµœì‹  ê°’ì„ ??ƒ ì°¸ì¡°
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const handleKeyPress = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      
      if (!currentState.gameStarted || currentState.gameEnded) return;

      // ???„ë ˆ???íƒœ ?…ë°?´íŠ¸ - ?¤ë? ?Œë????Œë§Œ ?Œë¦° ?íƒœë¡?ë³€ê²?
      setPressedKeys((prev) => {
        if (prev.has(lane)) return prev; // ?´ë? ?„ë¥¸ ?¤ëŠ” ?…ë°?´íŠ¸ ?¤í‚µ
        const next = new Set(prev);
        next.add(lane);
        
        // ?¤ë? ???Œë§Œ ì§§ê²Œ ?œê°„ ?™ì•ˆ ?¼ì–´?“ìŒ
        setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(lane);
            return next;
          });
        }, 100); // 100ms ?„ì— ???¼ê¸°
        
        return next;
      });

      // ?´ë‹¹ ?ˆì¸?ì„œ ê°€??ê°€ê¹Œìš´ ?¸íŠ¸ ì°¾ê¸°
      const laneNotes = currentState.notes.filter(
        (note) => note.lane === lane && !note.hit
      );

      // ?¸íŠ¸ê°€ ?†ìœ¼ë©??„ë¬´ê²ƒë„ ?˜ì? ?ŠìŒ (?±ê³µ/?¤íŒ¨ ?ë‹¨??ì²˜ë¦¬ ????
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
        
        // ?íƒœ ?…ë°?´íŠ¸ë¥??˜ë‚˜ë¡?ë¬¶ì¹¨
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

          // ë¡±ë…¸?¸ê? ?„ë‹Œ ê²½ìš°?ë§Œ hit: trueë¡??¤ì •
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

        // ë¡±ë…¸?¸ì¸ ê²½ìš° holdingNotes??ì¶”ê?
        if (isHoldNote) {
          setHoldingNotes((prev) => {
            const next = new Map(prev);
            next.set(bestNote.id, bestNote);
            return next;
          });
        }

        // ?ˆë¡œ???ì • ?¼ë“œë°?ì¶”ê? - ?´ì „ ?ì •?€ ?œê±°
        const feedbackId = feedbackIdRef.current++;
        setJudgeFeedbacks([{ id: feedbackId, judge }]);
        
        // ?ì •? ì— ?´í™??ì¶”ê? (missê°€ ?„ë‹ ?Œë§Œ) - ?¸íŠ¸ê°€ ?ˆëŠ” ?ì •???„ì¹˜?ì„œ
        if (judge !== 'miss') {
          const effectId = keyEffectIdRef.current++;
          // ?¸íŠ¸ê°€ ?ì •? ì— ?ˆëŠ” ?„ì¹˜ (?ì •??y ì¢Œí‘œ: 640px)
          const effectX = LANE_POSITIONS[lane];
          const effectY = 640; // ?ì •???„ì¹˜
          setKeyEffects((prev) => [...prev, { id: effectId, lane, x: effectX, y: effectY }]);
          
          // ?¼ë“œë°??œê±°?€ ?´í™???œê±°ë¥?requestAnimationFrame?¼ë¡œ ì²˜ë¦¬?˜ì—¬ ?Œë”ë§?ìµœì ??
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
              setKeyEffects((prev) => prev.filter(e => e.id !== effectId));
            }, 800);
          });
        } else {
          // miss??ê²½ìš° ?´í™???†ì´ ?¼ë“œë°±ë§Œ ?œê±°
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
            }, 800);
          });
        }
      }
      // bestNoteê°€ null?´ê³  laneNotesê°€ ?ˆìœ¼ë©??€?´ë°????ë§ëŠ” ê²½ìš°
      // ??ê²½ìš°?ë„ Miss ì²˜ë¦¬ë¥??˜ì? ?ŠìŒ (?±ê³µ/?¤íŒ¨ê°€ êµ¬ë³„?????˜ë©´ ì²˜ë¦¬ ????
    },
    [] // ê¸°ì¡´ ì½”ë“œ ?œê±°?˜ì—¬ ?¨ìˆ˜ ?ì„±??ë°©ì?
  );

  const handleKeyRelease = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(lane);
        return next;
      });

      // ?´ë‹¹ ?ˆì¸??holdingNotes?ì„œ ë¡±ë…¸??ì°¾ê¸°
      setHoldingNotes((prev) => {
        const next = new Map(prev);
        const laneHoldNotes = Array.from(prev.values()).filter(
          (note) => note.lane === lane && !note.hit
        );

        for (const holdNote of laneHoldNotes) {
          const currentTime = currentState.currentTime;
          const endTime = typeof holdNote.endTime === 'number' ? holdNote.endTime : holdNote.time + (holdNote.duration || 0);
          const timeDiff = Math.abs(endTime - currentTime);
          // ë¡±ë…¸???ì • ?ˆë„???¬ìš© (?¼ë°˜ ?ì •ë³´ë‹¤ ?¬ìœ ë¡œì?)
          const holdReleaseWindow = judgeConfig.holdReleaseWindows.good;
          const isBeforeEnd = currentTime < endTime - holdReleaseWindow;
          
          if (timeDiff <= holdReleaseWindow) {
            // ë¡±ë…¸?????ì • (ë¡±ë…¸???„ìš© ?ì • ?¨ìˆ˜ ?¬ìš©)
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

            // ?ì • ?¼ë“œë°?ì¶”ê?
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

            // holdingNotes?ì„œ ?œê±°
            next.delete(holdNote.id);
          } else if (isBeforeEnd) {
            // ë¡±ë…¸?¸ë? ì¶©ë¶„??? ì??˜ê¸° ?„ì— ?ì„ ?€ ê²½ìš° Miss ì²˜ë¦¬
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

  useEffect(() => {
    if (
      gameState.gameStarted &&
      gameState.currentTime >= GAME_DURATION &&
      !gameState.gameEnded
    ) {
      setGameState((prev) => ({ ...prev, gameEnded: true }));
      
      // ê²Œì„ ì¢…ë£Œ ??YouTube ?Œë ˆ?´ì–´ ?•ì?/?´ì œ
      if (isTestMode && testYoutubePlayer && testYoutubePlayerReadyRef.current) {
        try {
          testYoutubePlayer.pauseVideo?.();
        } catch (e) {
          console.warn('YouTube ?¼ì‹œ?•ì? ?¤íŒ¨:', e);
        }
      }
    }
  }, [gameState.currentTime, gameState.gameStarted, gameState.gameEnded, isTestMode, testYoutubePlayer]);

  const resetGame = () => {
    setIsTestMode(false);
    audioHasStartedRef.current = false;
    testPreparedNotesRef.current = [];
    processedMissNotes.current.clear(); // Miss ì²˜ë¦¬ ?¸íŠ¸ ì¶”ì  ì´ˆê¸°??
    setPressedKeys(new Set());
    setHoldingNotes(new Map()); // ë¡±ë…¸???íƒœ ì´ˆê¸°??
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
      setHoldingNotes(new Map()); // ë¡±ë…¸???íƒœ ì´ˆê¸°??
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
        alert('? íƒ???œì‘ ?„ì¹˜ ?´í›„???¸íŠ¸ê°€ ?†ìŠµ?ˆë‹¤. ?œì‘ ?„ì¹˜ë¥?ì¡°ì •?´ì£¼?¸ìš”.');
        return;
      }

      // YouTube ?¤ë””???¤ì • ?„ë‹¬
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
      
      // YouTube ?Œë ˆ?´ì–´ ì´ˆê¸°?”ë? ?„í•´ videoId ?¤ì •
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
    
    // YouTube ?Œë ˆ?´ì–´ ?•ë¦¬
    if (testYoutubePlayer) {
      try {
        testYoutubePlayer.destroy();
      } catch (e) {
        console.warn('?ŒìŠ¤???Œë ˆ?´ì–´ ?•ë¦¬ ?¤íŒ¨:', e);
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

  // ESC ?¤ë¡œ ?ŒìŠ¤??ëª¨ë“œ ?˜ê?ê¸?
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

  // ?ŒìŠ¤??ëª¨ë“œ YouTube ?Œë ˆ?´ì–´ ì´ˆê¸°??
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
          console.warn('?ŒìŠ¤???Œë ˆ?´ì–´ ?•ë¦¬ ?¤íŒ¨:', e);
        }
      }
      setTestYoutubePlayer(null);
      testYoutubePlayerReadyRef.current = false;
    };

    // ê¸°ì¡´ ?Œë ˆ?´ì–´ ?•ë¦¬
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
        console.error('YouTube IFrame APIë¥?ë¡œë“œ?˜ì? ëª»í–ˆ?µë‹ˆ??');
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

              console.log('???ŒìŠ¤??YouTube ?Œë ˆ?´ì–´ ì¤€ë¹??„ë£Œ');
              
              // ?Œë ˆ?´ì–´ê°€ ì¤€ë¹„ë˜ë©??¤ì •ë§??˜ê³ , ?¤ì œ ?¬ìƒ?€ ê²Œì„ ?œì‘ ?„ì— ?˜í–‰
              setTimeout(() => {
                if (!isCancelled && player && testAudioSettingsRef.current) {
                  try {
                    const { playbackSpeed } = testAudioSettingsRef.current;
                    const startTimeSec = getAudioBaseSeconds();
                    
                    // ?¬ìƒ ?ë„ ?¤ì •
                    player.setPlaybackRate?.(playbackSpeed);
                    
                    // ?œì‘ ?„ì¹˜ë¡??´ë™ (ë¯¸ë¦¬ ?´ë™)
                    player.seekTo(startTimeSec, true);
                    
                    console.log(`?µ YouTube ?Œë ˆ?´ì–´ ì¤€ë¹??„ë£Œ (${startTimeSec}ì´? ${playbackSpeed}x) - ê²Œì„ ?œì‘ ???¬ìƒ`);
                  } catch (e) {
                    console.warn('YouTube ?Œë ˆ?´ì–´ ?¤ì • ?¤íŒ¨:', e);
                  }
                }
              }, 100);
            },
          },
        });
      } catch (e) {
        console.error('?ŒìŠ¤???Œë ˆ?´ì–´ ?ì„± ?¤íŒ¨:', e);
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

  // ì±„ë³´ ?€???¸ë“¤??
  const handleChartSave = useCallback((notes: Note[]) => {
    setIsTestMode(false);
    testPreparedNotesRef.current = [];
    setGameState((prev) => ({
      ...prev,
      notes: notes.map((note) => ({ ...note, y: 0, hit: false })),
    }));
    setIsEditorOpen(false);
  }, []);

  // ?ë””???«ê¸° ?¸ë“¤??
  const handleEditorCancel = useCallback(() => {
    setIsTestMode(false);
    testPreparedNotesRef.current = [];
    setIsEditorOpen(false);
  }, []);

  // ì±„ë³´ ? íƒ ?¸ë“¤??
  const handleChartSelect = useCallback((chartData: any) => {
    try {
      if (!chartData) {
        console.error('Chart data is missing');
        alert('ì±„ë³´ ?°ì´?°ê? ?†ìŠµ?ˆë‹¤.');
        return;
      }

      if (!chartData.notes || !Array.isArray(chartData.notes)) {
        console.error('Invalid chart data: notes array missing');
        alert('? íš¨?˜ì? ?Šì? ì±„ë³´ ?°ì´?°ì…?ˆë‹¤.');
        return;
      }

      setIsChartSelectOpen(false);
      
      // ê¸°ì¡´ ?ŒìŠ¤??ëª¨ë“œ ?Œë ˆ?´ì–´ ?•ë¦¬
      if (testYoutubePlayer) {
        try {
          testYoutubePlayer.destroy?.();
        } catch (e) {
          console.warn('ê¸°ì¡´ ?Œë ˆ?´ì–´ ?•ë¦¬ ?¤íŒ¨:', e);
        }
      }
      setTestYoutubePlayer(null);
      testYoutubePlayerReadyRef.current = false;
      
      // YouTube ?Œë ˆ?´ì–´ ?¤ì • (?„ìš”?? - ë¨¼ì? ?¤ì •?´ì•¼ useEffectê°€ ?¬ë°”ë¥´ê²Œ ?‘ë™??
      if (chartData.youtubeVideoId) {
        testAudioSettingsRef.current = {
          youtubeVideoId: chartData.youtubeVideoId,
          youtubeUrl: chartData.youtubeUrl || '',
          startTimeMs: 0,
          playbackSpeed: 1,
        };
        setTestYoutubeVideoId(chartData.youtubeVideoId); // stateë¡??¤ì •?˜ì—¬ useEffectê°€ ê°ì??˜ë„ë¡?
        setIsTestMode(true);
      } else {
        setIsTestMode(false);
        setTestYoutubeVideoId(null);
        testAudioSettingsRef.current = null;
      }
      
      // ? íƒ??ì±„ë³´ ?°ì´?°ë¡œ ê²Œì„ ?íƒœ ì´ˆê¸°??
      const preparedNotes = chartData.notes.map((note: Note) => ({
        ...note,
        y: 0,
        hit: false,
      }));
      
      if (preparedNotes.length === 0) {
        alert('??ì±„ë³´?ëŠ” ?¸íŠ¸ê°€ ?†ìŠµ?ˆë‹¤.');
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
    } catch (error) {
      console.error('Failed to load chart:', error);
      alert('ì±„ë³´ë¥?ë¶ˆëŸ¬?¤ëŠ”???¤íŒ¨?ˆìŠµ?ˆë‹¤. ?¤ì‹œ ?œë„?´ì£¼?¸ìš”.');
    }
  }, [buildInitialScore]);

  // ê´€ë¦¬ì ?ŒìŠ¤???¸ë“¤??
  const handleAdminTest = useCallback((chartData: any) => {
    // ê´€ë¦¬ì ?”ë©´??ë¨¼ì? ?«ê³ , ?¤ìŒ ?Œë”ë§??¬ì´?´ì—???ŒìŠ¤???œì‘
    setIsAdminOpen(false);
    // ?íƒœ ?…ë°?´íŠ¸ê°€ ?„ë£Œ?????ŒìŠ¤???œì‘ (?¤ìŒ ?±ì—???¤í–‰)
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

  // ?ë””?°ê? ?´ë ¤?ˆìœ¼ë©??ë””?°ë§Œ ?œì‹œ
  if (isEditorOpen) {
    return <ChartEditor onSave={handleChartSave} onCancel={handleEditorCancel} onTest={handleEditorTest} />;
  }

  // ì±„ë³´ ? íƒ ?”ë©´
  if (isChartSelectOpen) {
    return <ChartSelect onSelect={handleChartSelect} onClose={() => setIsChartSelectOpen(false)} />;
  }

  // ê´€ë¦¬ì ?”ë©´
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
        backgroundColor: '#1a1a1a',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '500px', // ì¢Œìš° ?¬ë°±??3ë¶„ì˜ 1ë¡?ì¤„ì„: 700px - 400px = 300px -> 100px
          height: '800px',
          backgroundColor: '#1f1f1f', // ?Œë°±??ë°°ê²½ (ê°€???´ë‘?´ìƒ‰)
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* 4ê°??ˆì¸ ?ì—­ ë°°ê²½ */}
        <div
          style={{
            position: 'absolute',
            left: '50px',
            top: '0',
            width: '400px',
            height: '100%',
            backgroundColor: '#2a2a2a', // 4ê°??ˆì¸ ?ì—­ ë°°ê²½ (ì¢€ ë°ì? ??
          }}
        />
        
        {/* ë°°ê²½ ?¼ì¸ êµ¬ë¶„??- ?ˆì¸ ?¬ì´ ê²½ê³„?€ ?‘ìª½ ??*/}
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

        {/* ?¸íŠ¸ ?Œë”ë§?*/}
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

        {/* ?ì •??- ê²Œì„ ì¤‘ì—ë§??œì‹œ (4ê°??ˆì¸ ?ì—­?ë§Œ) */}
        {gameState.gameStarted && (
          <JudgeLine left={JUDGE_LINE_LEFT} width={JUDGE_LINE_WIDTH} />
        )}

        {/* 4ê°??ˆì¸ - ê²Œì„ ì¤‘ì—ë§??œì‹œ */}
        {gameState.gameStarted &&
          LANE_POSITIONS.map((x, index) => (
            <KeyLane
              key={index}
              x={x}
              keys={LANE_KEYS[index]}
              isPressed={pressedKeys.has(index as Lane)}
            />
          ))}

        {/* ?ì •? ì— ?˜ì˜¤???´í™??- ?¸íŠ¸ê°€ ?ˆëŠ” ?„ì¹˜?ì„œ (ê²Œì„ ì¤‘ì—ë§??œì‹œ) */}
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
              {/* ?Œí‹°???´í™??*/}
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
              {/* ?¬ë°©?¼ë¡œ ? ì•„ê°€???Œí‹°??*/}
              {[...Array(8)].map((_, i) => {
                const angle = (i * 360) / 8;
                const radians = (angle * Math.PI) / 180;
                const distance = 40;
                const x = Math.cos(radians) * distance;
                const y = Math.sin(radians) * distance - 40; // ?„ë¡œ ì¢€ ? ì•„ê°€?„ë¡
                
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

        {/* ?ì • ?¼ë“œë°?- 4ê°??ˆì¸ ?ì—­ ì¤‘ì•™???µí•© ?œì‹œ (ê°œë³„ ? ë‹ˆë©”ì´?? */}
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

        {/* ?ìˆ˜ - ê²Œì„ ì¤‘ì—ë§??œì‹œ */}
        {gameState.gameStarted && <ScoreComponent score={gameState.score} />}

        {/* ?ŒìŠ¤??ëª¨ë“œ ì¤??˜ê?ê¸?ë²„íŠ¼ */}
        {gameState.gameStarted && !gameState.gameEnded && isTestMode && (
          <button
            onClick={handleReturnToEditor}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: 'rgba(255, 68, 68, 0.9)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 68, 1)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 68, 68, 0.9)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ???˜ê?ê¸?
          </button>
        )}

        {/* ê²Œì„ ?œì‘/ì¢…ë£Œ UI */}
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
            {/* ì²??”ë©´ ?œì‹œ */}
            <h1 
              style={{ 
                fontSize: '50px', 
                marginBottom: '24px', 
                marginTop: '-40px',
                fontWeight: '900',
                fontStyle: 'italic',
                letterSpacing: '4px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: '0 0 40px rgba(102, 126, 234, 0.5)',
                fontFamily: 'Arial Black, sans-serif',
                textTransform: 'uppercase',
                lineHeight: '1.1',
              }}
            >
               UseRhythm
            </h1>
            <p style={{ fontSize: '18px', marginBottom: '48px', color: '#aaa' }}>
              ?„êµ¬??ë¦¬ë“¬ê²Œì„ ì±„ë³´ë¥?ë§Œë“¤ê³?ê³µìœ ?˜ì„¸??
            </p>

            {/* ë©”ì¸ ë©”ë‰´ */}
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
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1976D2';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2196F3';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
                }}
                onClick={() => {
                  setIsChartSelectOpen(true);
                }}
              >
                ?¶ï¸ ?Œë ˆ??
              </button>

              <button
                style={{
                  padding: '20px 40px',
                  fontSize: '22px',
                  backgroundColor: '#FF9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F57C00';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 152, 0, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FF9800';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.3)';
                }}
                onClick={() => {
                  setIsEditorOpen(true);
                }}
              >
                ?ï¸ ì±„ë³´ ë§Œë“¤ê¸?
              </button>

              <button
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  backgroundColor: '#9C27B0',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(156, 39, 176, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#7B1FA2';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(156, 39, 176, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#9C27B0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.3)';
                }}
                onClick={() => {
                  setIsAdminOpen(true);
                }}
              >
                ?” ê´€ë¦¬ì
              </button>
            </div>


            {/* ?¤ì • */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '24px',
                borderRadius: '12px',
                marginTop: '16px',
              }}
            >
              <h3 style={{ fontSize: '20px', marginBottom: '20px', fontWeight: 'bold' }}>
                ?™ï¸ ê²Œì„ ?¤ì •
              </h3>
              
              {/* ?ë„ ì¡°ì ˆ ?¬ë¼?´ë” */}
              <div
                style={{
                  marginBottom: '16px',
                  color: '#fff',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    fontSize: '16px',
                    marginBottom: '12px',
                    fontWeight: '500',
                  }}
                >
                  ?¸íŠ¸ ?ë„: {speed.toFixed(1)}x
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
                    backgroundColor: '#555',
                    cursor: 'pointer',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginTop: '8px',
                    color: '#aaa',
                  }}
                >
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>5.0x</span>
                  <span>10.0x</span>
                </div>
              </div>

              <div style={{ fontSize: '14px', color: '#aaa', marginTop: '16px' }}>
                ??ì¡°ì‘?? D, F, J, K ?¤ë? ?¬ìš©?˜ì„¸??
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
                color: '#fff',
                backgroundColor: 'rgba(0,0,0,0.85)',
                padding: '32px',
                borderRadius: '12px',
                minWidth: '360px',
              }}
            >
              <h1 style={{ fontSize: '40px', marginBottom: '20px' }}>?ŒìŠ¤??ì¢…ë£Œ</h1>
              <div style={{ fontSize: '20px', marginBottom: '28px' }}>
                <div>?•í™•?? {accuracy.toFixed(2)}%</div>
                <div>ìµœë? ì½¤ë³´: {gameState.score.maxCombo}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={handleRetest}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    backgroundColor: '#4CAF50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  ?” ?¤ì‹œ ?ŒìŠ¤??
                </button>
                <button
                  onClick={handleReturnToEditor}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    backgroundColor: '#FF9800',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  ?ï¸ ?ë””?°ë¡œ ?Œì•„ê°€ê¸?
                </button>
                <button
                  onClick={resetGame}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    backgroundColor: '#616161',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  ?  ë©”ì¸ ë©”ë‰´
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
                color: '#fff',
                backgroundColor: 'rgba(0,0,0,0.8)',
                padding: '32px',
                borderRadius: '12px',
              }}
            >
              <h1 style={{ fontSize: '48px', marginBottom: '32px' }}>
                ê²Œì„ ì¢…ë£Œ
              </h1>
              <div style={{ fontSize: '24px', marginBottom: '32px' }}>
                <div>ìµœë? ì½¤ë³´: {gameState.score.maxCombo}</div>
                <div>?•í™•?? {accuracy.toFixed(2)}%</div>
              </div>
              <button
                onClick={resetGame}
                style={{
                  padding: '16px 32px',
                  fontSize: '24px',
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                ?¤ì‹œ ?œì‘
              </button>
            </div>
          )
        )}
        
        {/* ?ŒìŠ¤??ëª¨ë“œ YouTube ?Œë ˆ?´ì–´ (?¨ê? - ?¤ë””?¤ë§Œ ?¬ìƒ) */}
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

