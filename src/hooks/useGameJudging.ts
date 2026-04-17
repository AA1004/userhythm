import { useState, useRef, useCallback, useEffect } from 'react';
import { Lane, Note, JudgeType, GameState } from '../types/game';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { LANE_POSITIONS, JUDGE_FEEDBACK_DURATION_MS } from '../constants/gameConstants';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import {
  HitNoteIdsRef,
  isNoteResolved,
  markNoteResolved,
} from '../utils/noteRuntimeState';

function binarySearchFirstNoteAtOrAfter(notes: Note[], targetTime: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export interface JudgeFeedback {
  id: number;
  judge: JudgeType;
}

export interface KeyEffect {
  id: number;
  lane: Lane;
  x: number;
  y: number;
  judge: JudgeType;
}

export interface UseGameJudgingOptions {
  gameState: GameState;
  gameStateRef: React.MutableRefObject<GameState>;
  currentTimeRef: React.MutableRefObject<number>;
  laneCenters?: readonly number[];
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  processedMissNotes: React.MutableRefObject<Set<number>>;
  hitNoteIdsRef: HitNoteIdsRef;
  judgeLineY: number;
}

export interface UseGameJudgingReturn {
  pressedKeys: Set<Lane>;
  holdingNotes: Map<number, Note>;
  judgeFeedbacks: JudgeFeedback[];
  keyEffects: KeyEffect[];
  handleKeyPress: (lane: Lane) => void;
  handleKeyRelease: (lane: Lane) => void;
  handleNoteMiss: (note: Note) => void;
}

export function useGameJudging(options: UseGameJudgingOptions): UseGameJudgingReturn {
  const {
    gameState,
    gameStateRef,
    currentTimeRef,
    laneCenters = LANE_POSITIONS,
    setGameState,
    processedMissNotes,
    hitNoteIdsRef,
    judgeLineY,
  } = options;

  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const [holdingNotes, setHoldingNotes] = useState<Map<number, Note>>(new Map());
  const holdingNotesRef = useRef<Map<number, Note>>(new Map());
  const [judgeFeedbacks, setJudgeFeedbacks] = useState<JudgeFeedback[]>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<KeyEffect[]>([]);
  const keyEffectIdRef = useRef(0);
  const judgeFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const keyEffectTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const laneEffectIdsRef = useRef<Map<Lane, number>>(new Map());
  const judgeLaneCursorRef = useRef<number[]>([0, 0, 0, 0]);

  const updateScoreFromJudge = useCallback((judge: JudgeType, prevScore: GameState['score']): GameState['score'] => {
    const newScore = { ...prevScore };

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

    return newScore;
  }, []);

  const addJudgeFeedback = useCallback(
    (judge: JudgeType, lane: Lane) => {
      const currentState = gameStateRef.current;
      if (!currentState.gameStarted || currentState.gameEnded) return;

      if (judgeFeedbackTimerRef.current) {
        clearTimeout(judgeFeedbackTimerRef.current);
        judgeFeedbackTimerRef.current = null;
      }
      setJudgeFeedbacks([]);

      const feedbackId = feedbackIdRef.current++;
      setJudgeFeedbacks([{ id: feedbackId, judge }]);

      const effectId = keyEffectIdRef.current++;
      const effectX = laneCenters[lane] ?? LANE_POSITIONS[lane];
      const effectY = judgeLineY;

      const previousLaneEffectId = laneEffectIdsRef.current.get(lane);
      if (previousLaneEffectId !== undefined) {
        const previousTimer = keyEffectTimersRef.current.get(previousLaneEffectId);
        if (previousTimer) {
          clearTimeout(previousTimer);
          keyEffectTimersRef.current.delete(previousLaneEffectId);
        }
      }

      laneEffectIdsRef.current.set(lane, effectId);
      setKeyEffects((prev) => [
        ...prev.filter((effect) => effect.lane !== lane),
        { id: effectId, lane, x: effectX, y: effectY, judge },
      ]);

      requestAnimationFrame(() => {
        const feedbackTimer = setTimeout(() => {
          setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
          if (judgeFeedbackTimerRef.current === feedbackTimer) {
            judgeFeedbackTimerRef.current = null;
          }
        }, JUDGE_FEEDBACK_DURATION_MS);
        judgeFeedbackTimerRef.current = feedbackTimer;

        const keyEffectTimer = setTimeout(() => {
          setKeyEffects((prev) => prev.filter((e) => e.id !== effectId));
          keyEffectTimersRef.current.delete(effectId);
          if (laneEffectIdsRef.current.get(lane) === effectId) {
            laneEffectIdsRef.current.delete(lane);
          }
        }, JUDGE_FEEDBACK_DURATION_MS);
        keyEffectTimersRef.current.set(effectId, keyEffectTimer);
      });
    },
    [gameStateRef, laneCenters, judgeLineY]
  );

  const handleKeyPress = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      if (!currentState.gameStarted || currentState.gameEnded) return;

      setPressedKeys((prev) => {
        if (prev.has(lane)) return prev;
        const next = new Set(prev);
        next.add(lane);
        return next;
      });

      const currentTime = currentTimeRef.current;
      let targetNote: Note | null = null;
      const shouldProfile = isGameplayProfilerEnabled();
      const judgeScanStart = shouldProfile ? performance.now() : 0;
      let scannedNotes = 0;
      const binaryStartIndex = binarySearchFirstNoteAtOrAfter(
        currentState.notes,
        currentTime - judgeConfig.noteSearchRange
      );
      const searchStartIndex = Math.max(
        judgeLaneCursorRef.current[lane] ?? 0,
        binaryStartIndex
      );
      judgeLaneCursorRef.current[lane] = Math.max(
        judgeLaneCursorRef.current[lane] ?? 0,
        binaryStartIndex
      );

      for (let i = searchStartIndex; i < currentState.notes.length; i++) {
        const note = currentState.notes[i];
        scannedNotes += 1;
        const timeDiff = note.time - currentTime;
        if (timeDiff > judgeConfig.noteSearchRange) {
          break;
        }
        if (note.lane !== lane || isNoteResolved(note, hitNoteIdsRef)) continue;
        if (holdingNotesRef.current.has(note.id)) continue;

        targetNote = note;
        break;
      }

      if (shouldProfile) {
        recordGameplayMetric('judgeScan', performance.now() - judgeScanStart, scannedNotes);
      }

      if (!targetNote) return;

      const isHoldNote = targetNote.type === 'hold' && targetNote.duration > 0;
      const judge = judgeTiming(targetNote.time - currentTime);
      if (judge === null) return;

      const hitProcessingStart = shouldProfile ? performance.now() : 0;
      if (!isHoldNote) {
        markNoteResolved(targetNote, hitNoteIdsRef);
      }
      if (shouldProfile) {
        recordGameplayMetric('hitProcessing', performance.now() - hitProcessingStart, 1);
      }

      setGameState((prev) => {
        const newScore = updateScoreFromJudge(judge, prev.score);

        return {
          ...prev,
          score: newScore,
        };
      });

      if (isHoldNote) {
        setHoldingNotes((prev) => {
          const next = new Map(prev);
          next.set(targetNote.id, targetNote);
          holdingNotesRef.current = next;
          return next;
        });
      }

      addJudgeFeedback(judge, lane);
    },
    [gameStateRef, currentTimeRef, hitNoteIdsRef, setGameState, updateScoreFromJudge, addJudgeFeedback]
  );

  const handleKeyRelease = useCallback(
    (lane: Lane) => {
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(lane);
        return next;
      });

      setHoldingNotes((prev) => {
        const next = new Map(prev);
        const laneHoldNotes = Array.from(prev.values()).filter(
          (note) => note.lane === lane && !isNoteResolved(note, hitNoteIdsRef)
        );

        for (const holdNote of laneHoldNotes) {
          const currentTime = currentTimeRef.current;
          const endTime =
            typeof holdNote.endTime === 'number'
              ? holdNote.endTime
              : holdNote.time + (holdNote.duration || 0);
          const timeDiff = Math.abs(endTime - currentTime);
          const holdReleaseWindow = judgeConfig.holdReleaseWindows.good;
          const isBeforeEnd = currentTime < endTime - holdReleaseWindow;

          if (timeDiff <= holdReleaseWindow) {
            const judge = judgeHoldReleaseTiming(endTime - currentTime);
            markNoteResolved(holdNote, hitNoteIdsRef);

            setGameState((prevState) => {
              const newScore = updateScoreFromJudge(judge, prevState.score);

              return {
                ...prevState,
                score: newScore,
              };
            });

            addJudgeFeedback(judge, lane);
            next.delete(holdNote.id);
          } else if (isBeforeEnd) {
            processedMissNotes.current.add(holdNote.id);
            markNoteResolved(holdNote, hitNoteIdsRef);

            setGameState((prevState) => {
              const newScore = updateScoreFromJudge('miss', prevState.score);

              return {
                ...prevState,
                score: newScore,
              };
            });

            addJudgeFeedback('miss', lane);
            next.delete(holdNote.id);
          }
        }

        holdingNotesRef.current = next;
        return next;
      });
    },
    [currentTimeRef, hitNoteIdsRef, setGameState, processedMissNotes, updateScoreFromJudge, addJudgeFeedback]
  );

  const handleNoteMiss = useCallback(
    (note: Note) => {
      if (processedMissNotes.current.has(note.id)) return;
      processedMissNotes.current.add(note.id);
      hitNoteIdsRef.current.add(note.id);

      setHoldingNotes((prev) => {
        if (!prev.has(note.id)) return prev;
        const next = new Map(prev);
        next.delete(note.id);
        holdingNotesRef.current = next;
        return next;
      });

      addJudgeFeedback('miss', note.lane);
    },
    [processedMissNotes, hitNoteIdsRef, addJudgeFeedback]
  );

  useEffect(() => {
    holdingNotesRef.current = holdingNotes;
  }, [holdingNotes]);

  useEffect(() => {
    if (!gameState.gameStarted) {
      if (judgeFeedbackTimerRef.current) {
        clearTimeout(judgeFeedbackTimerRef.current);
        judgeFeedbackTimerRef.current = null;
      }
      keyEffectTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      keyEffectTimersRef.current.clear();
      laneEffectIdsRef.current.clear();
      setJudgeFeedbacks([]);
      setKeyEffects([]);
      setPressedKeys(new Set());
      setHoldingNotes(new Map());
      holdingNotesRef.current = new Map();
      judgeLaneCursorRef.current = [0, 0, 0, 0];
    }
  }, [gameState.gameStarted]);

  useEffect(() => {
    return () => {
      if (judgeFeedbackTimerRef.current) {
        clearTimeout(judgeFeedbackTimerRef.current);
        judgeFeedbackTimerRef.current = null;
      }
      keyEffectTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      keyEffectTimersRef.current.clear();
      laneEffectIdsRef.current.clear();
    };
  }, []);

  return {
    pressedKeys,
    holdingNotes,
    judgeFeedbacks,
    keyEffects,
    handleKeyPress,
    handleKeyRelease,
    handleNoteMiss,
  };
}
