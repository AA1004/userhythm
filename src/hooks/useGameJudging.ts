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

const SCORE_SNAPSHOT_INTERVAL_MS = 80;

const scoresEqual = (a: GameState['score'], b: GameState['score']) =>
  a.perfect === b.perfect &&
  a.great === b.great &&
  a.good === b.good &&
  a.miss === b.miss &&
  a.combo === b.combo &&
  a.maxCombo === b.maxCombo;

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
  const pressedKeysRef = useRef<Set<Lane>>(new Set());
  const pressedKeysFrameRef = useRef<number | null>(null);
  const [holdingNotes, setHoldingNotes] = useState<Map<number, Note>>(new Map());
  const holdingNotesRef = useRef<Map<number, Note>>(new Map());
  const holdingNotesFrameRef = useRef<number | null>(null);
  const [judgeFeedbacks, setJudgeFeedbacks] = useState<JudgeFeedback[]>([]);
  const judgeFeedbacksRef = useRef<JudgeFeedback[]>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<KeyEffect[]>([]);
  const keyEffectsRef = useRef<KeyEffect[]>([]);
  const keyEffectIdRef = useRef(0);
  const effectCleanupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scoreRuntimeRef = useRef<GameState['score']>(gameState.score);
  const scoreSnapshotTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  const clearScoreSnapshotTimer = useCallback(() => {
    if (scoreSnapshotTimerRef.current) {
      clearTimeout(scoreSnapshotTimerRef.current);
      scoreSnapshotTimerRef.current = null;
    }
  }, []);

  const commitScoreSnapshot = useCallback(() => {
    clearScoreSnapshotTimer();
    const scoreSnapshot = scoreRuntimeRef.current;
    startTransition(() => {
      setGameState((prev) => {
        if (scoresEqual(prev.score, scoreSnapshot)) return prev;
        return {
          ...prev,
          score: scoreSnapshot,
        };
      });
    });
  }, [clearScoreSnapshotTimer, setGameState]);

  const scheduleScoreSnapshot = useCallback(() => {
    if (scoreSnapshotTimerRef.current) return;
    scoreSnapshotTimerRef.current = setTimeout(() => {
      scoreSnapshotTimerRef.current = null;
      commitScoreSnapshot();
    }, SCORE_SNAPSHOT_INTERVAL_MS);
  }, [commitScoreSnapshot]);

  const commitPressedKeysNextFrame = useCallback(() => {
    if (pressedKeysFrameRef.current !== null) return;
    pressedKeysFrameRef.current = requestAnimationFrame(() => {
      pressedKeysFrameRef.current = null;
      const next = new Set(pressedKeysRef.current);
      startTransition(() => {
        setPressedKeys(next);
      });
    });
  }, []);

  const commitHoldingNotesNextFrame = useCallback(() => {
    if (holdingNotesFrameRef.current !== null) return;
    holdingNotesFrameRef.current = requestAnimationFrame(() => {
      holdingNotesFrameRef.current = null;
      const next = new Map(holdingNotesRef.current);
      startTransition(() => {
        setHoldingNotes(next);
      });
    });
  }, []);

  const enqueueScoreJudge = useCallback(
    (judge: JudgeType) => {
      scoreRuntimeRef.current = updateScoreFromJudge(judge, scoreRuntimeRef.current);
      gameStateRef.current = {
        ...gameStateRef.current,
        score: scoreRuntimeRef.current,
      };
      scheduleScoreSnapshot();
    },
    [gameStateRef, scheduleScoreSnapshot, updateScoreFromJudge]
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

      if (!pressedKeysRef.current.has(lane)) {
        const nextPressedKeys = new Set(pressedKeysRef.current);
        nextPressedKeys.add(lane);
        pressedKeysRef.current = nextPressedKeys;
        commitPressedKeysNextFrame();
      }

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
        const nextHoldingNotes = new Map(holdingNotesRef.current);
        nextHoldingNotes.set(targetNote.id, targetNote);
        holdingNotesRef.current = nextHoldingNotes;
        commitHoldingNotesNextFrame();
      }

      addJudgeFeedback(judge, lane);
    },
    [
      gameStateRef,
      currentTimeRef,
      hitNoteIdsRef,
      enqueueScoreJudge,
      addJudgeFeedback,
      commitPressedKeysNextFrame,
      commitHoldingNotesNextFrame,
    ]
  );

  const handleKeyRelease = useCallback(
    (lane: Lane) => {
      if (pressedKeysRef.current.has(lane)) {
        const nextPressedKeys = new Set(pressedKeysRef.current);
        nextPressedKeys.delete(lane);
        pressedKeysRef.current = nextPressedKeys;
        commitPressedKeysNextFrame();
      }

      const nextHoldingNotes = new Map(holdingNotesRef.current);
      const laneHoldNotes = Array.from(nextHoldingNotes.values()).filter(
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
          nextHoldingNotes.delete(holdNote.id);
        } else if (isBeforeEnd) {
          processedMissNotes.current.add(holdNote.id);
          markNoteResolved(holdNote, hitNoteIdsRef);
          holdStartJudgeRef.current.delete(holdNote.id);

          const releaseFallbackJudge: JudgeType = startJudge ? 'good' : 'miss';
          enqueueScoreJudge(releaseFallbackJudge);

          addJudgeFeedback(releaseFallbackJudge, lane);
          nextHoldingNotes.delete(holdNote.id);
        }
      }

      if (laneHoldNotes.length > 0) {
        holdingNotesRef.current = nextHoldingNotes;
        commitHoldingNotesNextFrame();
      }
    },
    [
      currentTimeRef,
      hitNoteIdsRef,
      processedMissNotes,
      enqueueScoreJudge,
      addJudgeFeedback,
      commitPressedKeysNextFrame,
      commitHoldingNotesNextFrame,
    ]
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

      const judge: JudgeType = shouldDowngradeMissToGood ? 'good' : 'miss';
      enqueueScoreJudge(judge);
      addJudgeFeedback(judge, note.lane);
      return judge;
    },
    [processedMissNotes, hitNoteIdsRef, enqueueScoreJudge, addJudgeFeedback]
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
      clearScoreSnapshotTimer();
      scoreRuntimeRef.current = gameState.score;
      setJudgeFeedbacks([]);
      setKeyEffects([]);
      pressedKeysRef.current = new Set();
      holdingNotesRef.current = new Map();
      setPressedKeys(new Set());
      setHoldingNotes(new Map());
      holdStartJudgeRef.current.clear();
      judgeLaneCursorRef.current = [0, 0, 0, 0];
    }
  }, [gameState.gameStarted, gameState.score, clearEffectCleanupTimer, clearScoreSnapshotTimer]);

  useEffect(() => {
    if (gameState.gameEnded) {
      commitScoreSnapshot();
    }
  }, [gameState.gameEnded, commitScoreSnapshot]);

  useEffect(() => {
    return () => {
      clearEffectCleanupTimer();
      clearScoreSnapshotTimer();
      if (pressedKeysFrameRef.current !== null) {
        cancelAnimationFrame(pressedKeysFrameRef.current);
        pressedKeysFrameRef.current = null;
      }
      if (holdingNotesFrameRef.current !== null) {
        cancelAnimationFrame(holdingNotesFrameRef.current);
        holdingNotesFrameRef.current = null;
      }
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
