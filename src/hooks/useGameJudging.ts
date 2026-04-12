import { useState, useRef, useCallback, useEffect } from 'react';
import { Lane, Note, JudgeType, GameState } from '../types/game';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { LANE_POSITIONS, JUDGE_FEEDBACK_DURATION_MS } from '../constants/gameConstants';

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
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  processedMissNotes: React.MutableRefObject<Set<number>>;
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
  const { gameState, gameStateRef, currentTimeRef, setGameState, processedMissNotes, judgeLineY } = options;

  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const [holdingNotes, setHoldingNotes] = useState<Map<number, Note>>(new Map());
  const [judgeFeedbacks, setJudgeFeedbacks] = useState<JudgeFeedback[]>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<KeyEffect[]>([]);
  const keyEffectIdRef = useRef(0);
  const feedbackTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

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

      feedbackTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      feedbackTimersRef.current.clear();
      setJudgeFeedbacks([]);

      const feedbackId = feedbackIdRef.current++;
      setJudgeFeedbacks([{ id: feedbackId, judge }]);

      const effectId = keyEffectIdRef.current++;
      const effectX = LANE_POSITIONS[lane];
      const effectY = judgeLineY;
      setKeyEffects((prev) => [...prev, { id: effectId, lane, x: effectX, y: effectY, judge }]);

      requestAnimationFrame(() => {
        const timer = setTimeout(() => {
          setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
          setKeyEffects((prev) => prev.filter((e) => e.id !== effectId));
          feedbackTimersRef.current.delete(feedbackId);
        }, JUDGE_FEEDBACK_DURATION_MS);
        feedbackTimersRef.current.set(feedbackId, timer);
      });
    },
    [gameStateRef, judgeLineY]
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
      let bestNote: Note | null = null;
      let bestTimeDiff = Infinity;

      for (const note of currentState.notes) {
        if (note.lane !== lane || note.hit) continue;

        const timeDiff = Math.abs(note.time - currentTime);
        if (timeDiff < bestTimeDiff && timeDiff <= judgeConfig.noteSearchRange) {
          bestTimeDiff = timeDiff;
          bestNote = note;
        }
      }

      if (!bestNote) return;

      const isHoldNote = bestNote.type === 'hold' && bestNote.duration > 0;
      const judge = judgeTiming(bestNote.time - currentTime);
      if (judge === null) return;

      setGameState((prev) => {
        const newScore = updateScoreFromJudge(judge, prev.score);
        const updatedNotes = isHoldNote
          ? prev.notes
          : prev.notes.map((note) => (note.id === bestNote!.id ? { ...note, hit: true } : note));

        return {
          ...prev,
          notes: updatedNotes,
          score: newScore,
        };
      });

      if (isHoldNote) {
        setHoldingNotes((prev) => {
          const next = new Map(prev);
          next.set(bestNote.id, bestNote);
          return next;
        });
      }

      addJudgeFeedback(judge, lane);
    },
    [gameStateRef, currentTimeRef, setGameState, updateScoreFromJudge, addJudgeFeedback]
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
          (note) => note.lane === lane && !note.hit
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

            setGameState((prevState) => {
              const newScore = updateScoreFromJudge(judge, prevState.score);

              const updatedNotes = prevState.notes.map((note) =>
                note.id === holdNote.id ? { ...note, hit: true } : note
              );

              return {
                ...prevState,
                notes: updatedNotes,
                score: newScore,
              };
            });

            addJudgeFeedback(judge, lane);
            next.delete(holdNote.id);
          } else if (isBeforeEnd) {
            processedMissNotes.current.add(holdNote.id);

            setGameState((prevState) => {
              const newScore = updateScoreFromJudge('miss', prevState.score);

              const updatedNotes = prevState.notes.map((note) =>
                note.id === holdNote.id ? { ...note, hit: true } : note
              );

              return {
                ...prevState,
                notes: updatedNotes,
                score: newScore,
              };
            });

            addJudgeFeedback('miss', lane);
            next.delete(holdNote.id);
          }
        }

        return next;
      });
    },
    [gameStateRef, currentTimeRef, setGameState, processedMissNotes, updateScoreFromJudge, addJudgeFeedback]
  );

  const handleNoteMiss = useCallback(
    (note: Note) => {
      if (processedMissNotes.current.has(note.id)) return;
      processedMissNotes.current.add(note.id);

      setHoldingNotes((prev) => {
        if (!prev.has(note.id)) return prev;
        const next = new Map(prev);
        next.delete(note.id);
        return next;
      });

      addJudgeFeedback('miss', note.lane);
    },
    [processedMissNotes, addJudgeFeedback]
  );

  useEffect(() => {
    if (!gameState.gameStarted) {
      feedbackTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      feedbackTimersRef.current.clear();
      setJudgeFeedbacks([]);
      setKeyEffects([]);
      setPressedKeys(new Set());
      setHoldingNotes(new Map());
    }
  }, [gameState.gameStarted]);

  useEffect(() => {
    return () => {
      feedbackTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      feedbackTimersRef.current.clear();
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
