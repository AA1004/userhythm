import { startTransition, useState, useRef, useCallback, useEffect, type MutableRefObject } from 'react';
import { Lane, Note, JudgeType, GameState } from '../types/game';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { LANE_POSITIONS, JUDGE_FEEDBACK_DURATION_MS, KEY_EFFECT_DURATION_MS } from '../constants/gameConstants';
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

const scoresEqual = (a: GameState['score'], b: GameState['score']) =>
  a.perfect === b.perfect &&
  a.great === b.great &&
  a.good === b.good &&
  a.miss === b.miss &&
  a.combo === b.combo &&
  a.maxCombo === b.maxCombo;

const judgeFeedbackArraysEqual = (a: JudgeFeedback[], b: JudgeFeedback[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.judge !== right.judge ||
      left.expiresAt !== right.expiresAt ||
      left.x !== right.x ||
      left.y !== right.y ||
      left.lane !== right.lane ||
      left.timingDirection !== right.timingDirection
    ) {
      return false;
    }
  }
  return true;
};

const keyEffectArraysEqual = (a: KeyEffect[], b: KeyEffect[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.lane !== right.lane ||
      left.x !== right.x ||
      left.y !== right.y ||
      left.judge !== right.judge ||
      left.expiresAt !== right.expiresAt
    ) {
      return false;
    }
  }
  return true;
};

const laneSetsEqual = (a: Set<Lane>, b: Set<Lane>) => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const lane of a) {
    if (!b.has(lane)) return false;
  }
  return true;
};

const GAMEPLAY_HUD_PAINT_EVENT = 'userhythm:gameplay-hud-paint';

const requestGameplayHudPaint = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GAMEPLAY_HUD_PAINT_EVENT));
};

export interface JudgeFeedback {
  id: number;
  judge: JudgeType;
  expiresAt: number;
  x: number;
  y: number;
  lane: Lane;
  timingDirection: 'fast' | 'slow' | null;
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
  timingOffsetMs: number;
  onTimingSample?: (sample: { diffMs: number; judge: JudgeType; source: 'tap' | 'holdRelease' }) => void;
  pressedKeySnapshotsEnabled?: boolean;
  comboSnapshotsEnabled?: boolean;
  scoreSnapshotsEnabled?: boolean;
  effectSnapshotsEnabled?: boolean;
}

export interface UseGameJudgingReturn {
  displayScore: GameState['score'];
  combo: number;
  hudRevision: number;
  pressedKeys: Set<Lane>;
  pressedKeysRef: MutableRefObject<Set<Lane>>;
  holdingNotesRef: MutableRefObject<Map<number, Note>>;
  scoreRuntimeRef: MutableRefObject<GameState['score']>;
  judgeFeedbacksRef: MutableRefObject<JudgeFeedback[]>;
  keyEffectsRef: MutableRefObject<KeyEffect[]>;
  effectsRevision: number;
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
    timingOffsetMs,
    onTimingSample,
    pressedKeySnapshotsEnabled = true,
    comboSnapshotsEnabled = true,
    scoreSnapshotsEnabled = true,
    effectSnapshotsEnabled = true,
  } = options;

  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const pressedKeysRef = useRef<Set<Lane>>(new Set());
  const [displayScore, setDisplayScore] = useState<GameState['score']>(gameState.score);
  const [combo, setCombo] = useState<number>(gameState.score.combo);
  const comboRef = useRef<number>(gameState.score.combo);
  const holdingNotesRef = useRef<Map<number, Note>>(new Map());
  const judgeFeedbacksRef = useRef<JudgeFeedback[]>([]);
  const feedbackIdRef = useRef(0);
  const keyEffectsRef = useRef<KeyEffect[]>([]);
  const keyEffectIdRef = useRef(0);
  const [effectsRevision, setEffectsRevision] = useState(0);
  const [hudRevision, setHudRevision] = useState(0);
  const committedJudgeFeedbacksRef = useRef<JudgeFeedback[]>([]);
  const committedKeyEffectsRef = useRef<KeyEffect[]>([]);
  const effectCleanupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scoreRuntimeRef = useRef<GameState['score']>(gameState.score);
  const judgeLaneCursorRef = useRef<number[]>([0, 0, 0, 0]);
  const holdStartJudgeRef = useRef<Map<number, JudgeType>>(new Map());
  const freshSessionResetRef = useRef(false);
  const uiCommitFrameRef = useRef<number | null>(null);
  const uiDirtyRef = useRef({
    pressedKeys: false,
    displayScore: false,
    combo: false,
    effects: false,
  });

  const clearEffectCleanupTimer = useCallback(() => {
    if (effectCleanupTimerRef.current) {
      clearTimeout(effectCleanupTimerRef.current);
      effectCleanupTimerRef.current = null;
    }
  }, []);

  const scheduleUiCommit = useCallback(() => {
    if (uiCommitFrameRef.current !== null) return;
    uiCommitFrameRef.current = requestAnimationFrame(() => {
      uiCommitFrameRef.current = null;

      const dirty = uiDirtyRef.current;
      uiDirtyRef.current = {
        pressedKeys: false,
        displayScore: false,
        combo: false,
        effects: false,
      };

      if (!dirty.pressedKeys && !dirty.displayScore && !dirty.combo && !dirty.effects) {
        return;
      }

      const nextPressedKeys = dirty.pressedKeys ? new Set(pressedKeysRef.current) : null;
      const nextDisplayScore = dirty.displayScore ? scoreRuntimeRef.current : null;
      const nextCombo = dirty.combo ? comboRef.current : null;

      let shouldBumpEffectsRevision = false;
      if (dirty.effects) {
        const feedbackSnapshot = [...judgeFeedbacksRef.current];
        const effectsSnapshot = [...keyEffectsRef.current];
        shouldBumpEffectsRevision = !(
          judgeFeedbackArraysEqual(committedJudgeFeedbacksRef.current, feedbackSnapshot) &&
          keyEffectArraysEqual(committedKeyEffectsRef.current, effectsSnapshot)
        );
        if (shouldBumpEffectsRevision) {
          committedJudgeFeedbacksRef.current = feedbackSnapshot;
          committedKeyEffectsRef.current = effectsSnapshot;
        }
      }

      const shouldBumpHudRevision =
        (effectSnapshotsEnabled && dirty.effects) ||
        (pressedKeySnapshotsEnabled && dirty.pressedKeys) ||
        (comboSnapshotsEnabled && dirty.combo) ||
        (scoreSnapshotsEnabled && dirty.displayScore);

      startTransition(() => {
        if (nextPressedKeys && pressedKeySnapshotsEnabled) {
          setPressedKeys((prev) => (laneSetsEqual(prev, nextPressedKeys) ? prev : nextPressedKeys));
        }
        if (nextDisplayScore && scoreSnapshotsEnabled) {
          setDisplayScore((prev) => (scoresEqual(prev, nextDisplayScore) ? prev : nextDisplayScore));
        }
        if (nextCombo !== null && comboSnapshotsEnabled) {
          setCombo((prev) => (prev === nextCombo ? prev : nextCombo));
        }
        if (shouldBumpEffectsRevision && effectSnapshotsEnabled) {
          setEffectsRevision((prev) => prev + 1);
        }
        if (shouldBumpHudRevision) {
          setHudRevision((prev) => prev + 1);
        }
      });
    });
  }, [comboSnapshotsEnabled, effectSnapshotsEnabled, pressedKeySnapshotsEnabled, scoreSnapshotsEnabled]);

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
      judgeFeedbacksRef.current = judgeFeedbacksRef.current.filter((feedback) => feedback.expiresAt > now);
      keyEffectsRef.current = keyEffectsRef.current.filter((effect) => effect.expiresAt > now);
      if (effectSnapshotsEnabled) {
        uiDirtyRef.current.effects = true;
        scheduleUiCommit();
      }
      effectCleanupTimerRef.current = null;
      if (judgeFeedbacksRef.current.length > 0 || keyEffectsRef.current.length > 0) {
        scheduleEffectCleanup();
      }
    }, delayMs);
  }, [clearEffectCleanupTimer, effectSnapshotsEnabled, scheduleUiCommit]);

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

  const commitScoreSnapshot = useCallback(() => {
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
  }, [setGameState]);

  const enqueueScoreJudge = useCallback(
    (judge: JudgeType) => {
      scoreRuntimeRef.current = updateScoreFromJudge(judge, scoreRuntimeRef.current);
      comboRef.current = scoreRuntimeRef.current.combo;
      if (comboSnapshotsEnabled) {
        uiDirtyRef.current.combo = true;
      }
      if (scoreSnapshotsEnabled) {
        uiDirtyRef.current.displayScore = true;
      }
      if (comboSnapshotsEnabled || scoreSnapshotsEnabled) {
        scheduleUiCommit();
      } else {
        requestGameplayHudPaint();
      }
      gameStateRef.current = {
        ...gameStateRef.current,
        score: scoreRuntimeRef.current,
      };
    },
    [
      comboSnapshotsEnabled,
      gameStateRef,
      scheduleUiCommit,
      scoreSnapshotsEnabled,
      updateScoreFromJudge,
    ]
  );

  const addJudgeFeedback = useCallback(
    (judge: JudgeType, lane: Lane, timingDirection: 'fast' | 'slow' | null = null) => {
      const currentState = gameStateRef.current;
      if (!currentState.gameStarted || currentState.gameEnded) return;

      const feedbackExpiresAt = Date.now() + JUDGE_FEEDBACK_DURATION_MS;
      const effectExpiresAt = Date.now() + KEY_EFFECT_DURATION_MS;
      const feedbackId = feedbackIdRef.current++;
      const effectId = keyEffectIdRef.current++;
      const effectX = laneCenters[lane] ?? LANE_POSITIONS[lane];
      const effectY = judgeLineY;

      const feedbacks = judgeFeedbacksRef.current;
      feedbacks.length = 0;
      feedbacks.push({ id: feedbackId, judge, expiresAt: feedbackExpiresAt, x: effectX, y: effectY, lane, timingDirection });

      const keyEffects = keyEffectsRef.current;
      for (let i = keyEffects.length - 1; i >= 0; i -= 1) {
        if (keyEffects[i].lane === lane) {
          keyEffects.splice(i, 1);
        }
      }
      keyEffects.push({ id: effectId, lane, x: effectX, y: effectY, judge, expiresAt: effectExpiresAt });
      if (keyEffects.length > 4) {
        keyEffects.splice(0, keyEffects.length - 4);
      }
      if (effectSnapshotsEnabled) {
        uiDirtyRef.current.effects = true;
        scheduleUiCommit();
        scheduleEffectCleanup();
      } else {
        requestGameplayHudPaint();
      }
    },
    [effectSnapshotsEnabled, gameStateRef, laneCenters, judgeLineY, scheduleUiCommit, scheduleEffectCleanup]
  );

  const handleKeyPress = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      if (!currentState.gameStarted || currentState.gameEnded) return;

      if (!pressedKeysRef.current.has(lane)) {
        if (pressedKeySnapshotsEnabled) {
          const nextPressedKeys = new Set(pressedKeysRef.current);
          nextPressedKeys.add(lane);
          pressedKeysRef.current = nextPressedKeys;
        } else {
          pressedKeysRef.current.add(lane);
        }
        if (pressedKeySnapshotsEnabled) {
          uiDirtyRef.current.pressedKeys = true;
          scheduleUiCommit();
        } else {
          requestGameplayHudPaint();
        }
      }

      const currentTime = currentTimeRef.current - timingOffsetMs;
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
      const signedTimingDiff = targetNote.time - currentTime;
      const judge = judgeTiming(signedTimingDiff);
      if (judge === null) return;
      const timingDirection =
        judge === 'perfect'
          ? null
          : signedTimingDiff > 0
          ? 'fast'
          : signedTimingDiff < 0
          ? 'slow'
          : null;

      const hitProcessingStart = shouldProfile ? performance.now() : 0;
      if (!isHoldNote || judge === 'miss') {
        markNoteResolved(targetNote, hitNoteIdsRef);
      }
      if (shouldProfile) {
        recordGameplayMetric('hitProcessing', performance.now() - hitProcessingStart, 1);
      }

      if (judge !== 'perfect') {
        onTimingSample?.({
          diffMs: signedTimingDiff,
          judge,
          source: 'tap',
        });
      }

      enqueueScoreJudge(judge);

      if (isHoldNote && judge !== 'miss') {
        holdStartJudgeRef.current.set(targetNote.id, judge);
        holdingNotesRef.current.set(targetNote.id, targetNote);
      }

      addJudgeFeedback(judge, lane, timingDirection);
    },
    [
      gameStateRef,
      currentTimeRef,
      timingOffsetMs,
      hitNoteIdsRef,
      onTimingSample,
      enqueueScoreJudge,
      addJudgeFeedback,
      pressedKeySnapshotsEnabled,
      scheduleUiCommit,
    ]
  );

  const handleKeyRelease = useCallback(
    (lane: Lane) => {
      if (pressedKeysRef.current.has(lane)) {
        if (pressedKeySnapshotsEnabled) {
          const nextPressedKeys = new Set(pressedKeysRef.current);
          nextPressedKeys.delete(lane);
          pressedKeysRef.current = nextPressedKeys;
        } else {
          pressedKeysRef.current.delete(lane);
        }
        if (pressedKeySnapshotsEnabled) {
          uiDirtyRef.current.pressedKeys = true;
          scheduleUiCommit();
        } else {
          requestGameplayHudPaint();
        }
      }

      for (const holdNote of holdingNotesRef.current.values()) {
        if (holdNote.lane !== lane || isNoteResolved(holdNote, hitNoteIdsRef)) {
          continue;
        }

        const currentTime = currentTimeRef.current - timingOffsetMs;
        const endTime =
          typeof holdNote.endTime === 'number'
            ? holdNote.endTime
            : holdNote.time + (holdNote.duration || 0);
        const startJudge = holdStartJudgeRef.current.get(holdNote.id);
        const signedTimingDiff = endTime - currentTime;
        const timeDiff = Math.abs(signedTimingDiff);
        const holdReleaseWindow = judgeConfig.holdReleaseWindows.good;
        const isBeforeEnd = currentTime < endTime - holdReleaseWindow;

        if (timeDiff <= holdReleaseWindow) {
          const releaseJudge = judgeHoldReleaseTiming(endTime - currentTime);
          const finalJudge: JudgeType =
            startJudge === 'perfect' && releaseJudge !== 'miss'
              ? 'perfect'
              : releaseJudge;
          const timingDirection =
            finalJudge === 'perfect'
              ? null
              : signedTimingDiff > 0
              ? 'fast'
              : signedTimingDiff < 0
              ? 'slow'
              : null;
          markNoteResolved(holdNote, hitNoteIdsRef);
          holdStartJudgeRef.current.delete(holdNote.id);

          if (finalJudge !== 'perfect') {
            onTimingSample?.({
              diffMs: signedTimingDiff,
              judge: finalJudge,
              source: 'holdRelease',
            });
          }

          enqueueScoreJudge(finalJudge);

          addJudgeFeedback(finalJudge, lane, timingDirection);
          holdingNotesRef.current.delete(holdNote.id);
        } else if (isBeforeEnd) {
          processedMissNotes.current.add(holdNote.id);
          markNoteResolved(holdNote, hitNoteIdsRef);
          holdStartJudgeRef.current.delete(holdNote.id);

          const releaseFallbackJudge: JudgeType = startJudge ? 'good' : 'miss';
          enqueueScoreJudge(releaseFallbackJudge);

          addJudgeFeedback(releaseFallbackJudge, lane, 'fast');
          holdingNotesRef.current.delete(holdNote.id);
        } else {
          processedMissNotes.current.add(holdNote.id);
          markNoteResolved(holdNote, hitNoteIdsRef);
          holdStartJudgeRef.current.delete(holdNote.id);

          const lateReleaseJudge: JudgeType = startJudge ? 'good' : 'miss';
          enqueueScoreJudge(lateReleaseJudge);

          addJudgeFeedback(lateReleaseJudge, lane, 'slow');
          holdingNotesRef.current.delete(holdNote.id);
        }
      }
    },
    [
      currentTimeRef,
      timingOffsetMs,
      hitNoteIdsRef,
      onTimingSample,
      processedMissNotes,
      enqueueScoreJudge,
      addJudgeFeedback,
      pressedKeySnapshotsEnabled,
      scheduleUiCommit,
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

      if (holdingNotesRef.current.has(note.id)) {
        holdingNotesRef.current.delete(note.id);
      }

      const judge: JudgeType = shouldDowngradeMissToGood ? 'good' : 'miss';
      enqueueScoreJudge(judge);
      addJudgeFeedback(judge, note.lane, 'slow');
      return judge;
    },
    [
      processedMissNotes,
      hitNoteIdsRef,
      enqueueScoreJudge,
      addJudgeFeedback,
    ]
  );

  useEffect(() => {
    if (!gameState.gameStarted) {
      clearEffectCleanupTimer();
    }
    return clearEffectCleanupTimer;
  }, [gameState.gameStarted, clearEffectCleanupTimer]);

  useEffect(() => {
    const isFreshSession =
      gameState.gameStarted &&
      gameState.currentTime < 0 &&
      gameState.score.perfect === 0 &&
      gameState.score.great === 0 &&
      gameState.score.good === 0 &&
      gameState.score.miss === 0 &&
      gameState.score.combo === 0 &&
      gameState.score.maxCombo === 0;

    if (isFreshSession && !freshSessionResetRef.current) {
      freshSessionResetRef.current = true;
      clearEffectCleanupTimer();
      scoreRuntimeRef.current = gameState.score;
      setDisplayScore(gameState.score);
      comboRef.current = 0;
      setCombo(0);
      setHudRevision((prev) => prev + 1);
      judgeFeedbacksRef.current = [];
      keyEffectsRef.current = [];
      committedJudgeFeedbacksRef.current = [];
      committedKeyEffectsRef.current = [];
      setEffectsRevision((prev) => prev + 1);
      pressedKeysRef.current = new Set();
      holdingNotesRef.current = new Map();
      setPressedKeys(new Set());
      holdStartJudgeRef.current.clear();
      judgeLaneCursorRef.current = [0, 0, 0, 0];
      processedMissNotes.current.clear();
      hitNoteIdsRef.current.clear();
    }

    if (!isFreshSession) {
      freshSessionResetRef.current = false;
    }
  }, [
    gameState.gameStarted,
    gameState.currentTime,
    gameState.score,
    clearEffectCleanupTimer,
    processedMissNotes,
    hitNoteIdsRef,
  ]);

  useEffect(() => {
    if (!gameState.gameStarted) {
      freshSessionResetRef.current = false;
      clearEffectCleanupTimer();
      scoreRuntimeRef.current = gameState.score;
      setDisplayScore(gameState.score);
      comboRef.current = 0;
      setCombo(0);
      setHudRevision((prev) => prev + 1);
      judgeFeedbacksRef.current = [];
      keyEffectsRef.current = [];
      committedJudgeFeedbacksRef.current = [];
      committedKeyEffectsRef.current = [];
      setEffectsRevision((prev) => prev + 1);
      pressedKeysRef.current = new Set();
      holdingNotesRef.current = new Map();
      setPressedKeys(new Set());
      holdStartJudgeRef.current.clear();
      judgeLaneCursorRef.current = [0, 0, 0, 0];
    }
  }, [gameState.gameStarted, gameState.score, clearEffectCleanupTimer]);

  useEffect(() => {
    if (gameState.gameEnded) {
      commitScoreSnapshot();
    }
  }, [gameState.gameEnded, commitScoreSnapshot]);

  useEffect(() => {
    return () => {
      clearEffectCleanupTimer();
      if (uiCommitFrameRef.current !== null) {
        cancelAnimationFrame(uiCommitFrameRef.current);
        uiCommitFrameRef.current = null;
      }
      holdStartJudgeRef.current.clear();
    };
  }, [clearEffectCleanupTimer]);

  return {
    displayScore,
    combo,
    hudRevision,
    pressedKeys,
    pressedKeysRef,
    holdingNotesRef,
    scoreRuntimeRef,
    judgeFeedbacksRef,
    keyEffectsRef,
    effectsRevision,
    handleKeyPress,
    handleKeyRelease,
    handleNoteMiss,
  };
}
