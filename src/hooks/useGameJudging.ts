import { startTransition, useState, useRef, useCallback, useEffect } from 'react';
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
  expiresAt: number;
}

export interface KeyEffect {
  id: number;
  lane: Lane;
  x: number;
  y: number;
  judge: JudgeType;
  expiresAt: number;
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
  handleNoteMiss: (note: Note) => 'miss' | 'good';
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
  const judgeFeedbacksRef = useRef<JudgeFeedback[]>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<KeyEffect[]>([]);
  const keyEffectsRef = useRef<KeyEffect[]>([]);
  const keyEffectIdRef = useRef(0);
  const effectCleanupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const judgeLaneCursorRef = useRef<number[]>([0, 0, 0, 0]);
  const holdStartJudgeRef = useRef<Map<number, JudgeType>>(new Map());

  const clearEffectCleanupTimer = useCallback(() => {
    if (effectCleanupTimerRef.current) {
      clearTimeout(effectCleanupTimerRef.current);
      effectCleanupTimerRef.current = null;
    }
  }, []);

  const scheduleEffectCleanup = useCallback(() => {
    clearEffectCleanupTimer();

    const candidates = [
      ...judgeFeedbacksRef.current.map((feedback) => feedback.expiresAt),
      ...keyEffectsRef.current.map((effect) => effect.expiresAt),
    ];
    if (candidates.length === 0) return;

    const nextExpiry = Math.min(...candidates);
    const delayMs = Math.max(0, nextExpiry - Date.now());

    effectCleanupTimerRef.current = setTimeout(() => {
      const now = Date.now();
      setJudgeFeedbacks((prev) => {
        const next = prev.filter((feedback) => feedback.expiresAt > now);
        judgeFeedbacksRef.current = next;
        return next.length === prev.length ? prev : next;
      });
      setKeyEffects((prev) => {
        const next = prev.filter((effect) => effect.expiresAt > now);
        keyEffectsRef.current = next;
        return next.length === prev.length ? prev : next;
      });
      effectCleanupTimerRef.current = null;
      if (judgeFeedbacksRef.current.length > 0 || keyEffectsRef.current.length > 0) {
        scheduleEffectCleanup();
      }
    }, delayMs);
  }, [clearEffectCleanupTimer]);

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

  const enqueueScoreJudge = useCallback(
    (judge: JudgeType) => {
      startTransition(() => {
        setGameState((prev) => ({
          ...prev,
          score: updateScoreFromJudge(judge, prev.score),
        }));
      });
    },
    [setGameState, updateScoreFromJudge]
  );

  const addJudgeFeedback = useCallback(
    (judge: JudgeType, lane: Lane) => {
      const currentState = gameStateRef.current;
      if (!currentState.gameStarted || currentState.gameEnded) return;

      const expiresAt = Date.now() + JUDGE_FEEDBACK_DURATION_MS;
      const feedbackId = feedbackIdRef.current++;
      const effectId = keyEffectIdRef.current++;
      const effectX = laneCenters[lane] ?? LANE_POSITIONS[lane];
      const effectY = judgeLineY;

      startTransition(() => {
        setJudgeFeedbacks(() => {
          const next = [{ id: feedbackId, judge, expiresAt }];
          judgeFeedbacksRef.current = next;
          return next;
        });

        setKeyEffects((prev) => {
          const next = [
            ...prev.filter((effect) => effect.lane !== lane),
            { id: effectId, lane, x: effectX, y: effectY, judge, expiresAt },
          ].slice(-4);
          keyEffectsRef.current = next;
          return next;
        });
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
      if (!isHoldNote || judge === 'miss') {
        markNoteResolved(targetNote, hitNoteIdsRef);
      }
      if (shouldProfile) {
        recordGameplayMetric('hitProcessing', performance.now() - hitProcessingStart, 1);
      }

      enqueueScoreJudge(judge);

      if (isHoldNote && judge !== 'miss') {
        holdStartJudgeRef.current.set(targetNote.id, judge);
        setHoldingNotes((prev) => {
          const next = new Map(prev);
          next.set(targetNote.id, targetNote);
          holdingNotesRef.current = next;
          return next;
        });
      }

      addJudgeFeedback(judge, lane);
    },
    [gameStateRef, currentTimeRef, hitNoteIdsRef, enqueueScoreJudge, addJudgeFeedback]
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
          const startJudge = holdStartJudgeRef.current.get(holdNote.id);
          const timeDiff = Math.abs(endTime - currentTime);
          const holdReleaseWindow = judgeConfig.holdReleaseWindows.good;
          const isBeforeEnd = currentTime < endTime - holdReleaseWindow;

          if (timeDiff <= holdReleaseWindow) {
            const releaseJudge = judgeHoldReleaseTiming(endTime - currentTime);
            const finalJudge: JudgeType =
              startJudge === 'perfect' && releaseJudge !== 'miss'
                ? 'perfect'
                : releaseJudge;
            markNoteResolved(holdNote, hitNoteIdsRef);
            holdStartJudgeRef.current.delete(holdNote.id);

            enqueueScoreJudge(finalJudge);

            addJudgeFeedback(finalJudge, lane);
            next.delete(holdNote.id);
          } else if (isBeforeEnd) {
            processedMissNotes.current.add(holdNote.id);
            markNoteResolved(holdNote, hitNoteIdsRef);
            holdStartJudgeRef.current.delete(holdNote.id);

            const releaseFallbackJudge: JudgeType = startJudge ? 'good' : 'miss';
            enqueueScoreJudge(releaseFallbackJudge);

            addJudgeFeedback(releaseFallbackJudge, lane);
            next.delete(holdNote.id);
          }
        }

        holdingNotesRef.current = next;
        return next;
      });
    },
    [currentTimeRef, hitNoteIdsRef, processedMissNotes, enqueueScoreJudge, addJudgeFeedback]
  );

  const handleNoteMiss = useCallback(
    (note: Note) => {
      if (processedMissNotes.current.has(note.id)) return 'miss';
      processedMissNotes.current.add(note.id);
      hitNoteIdsRef.current.add(note.id);
      const startedHoldJudge = holdStartJudgeRef.current.get(note.id);
      const shouldDowngradeMissToGood =
        note.type === 'hold' && note.duration > 0 && !!startedHoldJudge;
      holdStartJudgeRef.current.delete(note.id);

      setHoldingNotes((prev) => {
        if (!prev.has(note.id)) return prev;
        const next = new Map(prev);
        next.delete(note.id);
        holdingNotesRef.current = next;
        return next;
      });

      addJudgeFeedback(shouldDowngradeMissToGood ? 'good' : 'miss', note.lane);
      return shouldDowngradeMissToGood ? 'good' : 'miss';
    },
    [processedMissNotes, hitNoteIdsRef, addJudgeFeedback]
  );

  useEffect(() => {
    holdingNotesRef.current = holdingNotes;
  }, [holdingNotes]);

  useEffect(() => {
    judgeFeedbacksRef.current = judgeFeedbacks;
    keyEffectsRef.current = keyEffects;

    if (!gameState.gameStarted) {
      clearEffectCleanupTimer();
      return;
    }

    scheduleEffectCleanup();
    return clearEffectCleanupTimer;
  }, [
    judgeFeedbacks,
    keyEffects,
    gameState.gameStarted,
    scheduleEffectCleanup,
    clearEffectCleanupTimer,
  ]);

  useEffect(() => {
    if (!gameState.gameStarted) {
      clearEffectCleanupTimer();
      setJudgeFeedbacks([]);
      setKeyEffects([]);
      setPressedKeys(new Set());
      setHoldingNotes(new Map());
      holdingNotesRef.current = new Map();
      holdStartJudgeRef.current.clear();
      judgeLaneCursorRef.current = [0, 0, 0, 0];
    }
  }, [gameState.gameStarted, clearEffectCleanupTimer]);

  useEffect(() => {
    return () => {
      clearEffectCleanupTimer();
      holdStartJudgeRef.current.clear();
    };
  }, [clearEffectCleanupTimer]);

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
