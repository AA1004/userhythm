import { useState, useRef, useCallback, useEffect } from 'react';
import { Lane, Note, JudgeType, GameState } from '../types/game';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { LANE_POSITIONS, JUDGE_LINE_Y, JUDGE_FEEDBACK_DURATION_MS } from '../constants/gameConstants';

export interface JudgeFeedback {
  id: number;
  judge: JudgeType;
}

export interface KeyEffect {
  id: number;
  lane: Lane;
  x: number;
  y: number;
}

export interface UseGameJudgingOptions {
  gameState: GameState;
  gameStateRef: React.MutableRefObject<GameState>;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  processedMissNotes: React.MutableRefObject<Set<number>>;
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
  const { gameStateRef, setGameState, processedMissNotes } = options;

  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const [holdingNotes, setHoldingNotes] = useState<Map<number, Note>>(new Map());
  const [judgeFeedbacks, setJudgeFeedbacks] = useState<JudgeFeedback[]>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<KeyEffect[]>([]);
  const keyEffectIdRef = useRef(0);
  // setTimeout 타이머를 추적하여 cleanup 시 정리
  const keyPressTimersRef = useRef<Map<Lane, NodeJS.Timeout>>(new Map());
  // 판정 피드백 및 이펙트 제거를 위한 타이머 추적
  const feedbackTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  /**
   * 판정 결과에 따라 점수를 업데이트하는 공통 함수
   */
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

  /**
   * 판정 피드백과 이펙트를 추가하는 공통 함수
   */
  const addJudgeFeedback = useCallback((judge: JudgeType, lane: Lane) => {
    // 새로운 판정이 나타날 때 기존 피드백 모두 제거 (겹침 방지)
    feedbackTimersRef.current.forEach((timer) => {
      clearTimeout(timer);
    });
    feedbackTimersRef.current.clear();
    setJudgeFeedbacks([]);
    
    const feedbackId = feedbackIdRef.current++;
    // 새로운 판정 피드백 추가
    setJudgeFeedbacks([{ id: feedbackId, judge }]);

    if (judge !== 'miss') {
      const effectId = keyEffectIdRef.current++;
      const effectX = LANE_POSITIONS[lane];
      const effectY = JUDGE_LINE_Y;
      setKeyEffects((prev) => [...prev, { id: effectId, lane, x: effectX, y: effectY }]);

      // 피드백 제거와 이펙트 제거를 requestAnimationFrame으로 처리하여 렌더링 최적화
      requestAnimationFrame(() => {
        const timer = setTimeout(() => {
          setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
          setKeyEffects((prev) => prev.filter((e) => e.id !== effectId));
          feedbackTimersRef.current.delete(feedbackId);
        }, JUDGE_FEEDBACK_DURATION_MS);
        feedbackTimersRef.current.set(feedbackId, timer);
      });
    } else {
      // miss인 경우 이펙트 없이 피드백만 제거
      requestAnimationFrame(() => {
        const timer = setTimeout(() => {
          setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
          feedbackTimersRef.current.delete(feedbackId);
        }, JUDGE_FEEDBACK_DURATION_MS);
        feedbackTimersRef.current.set(feedbackId, timer);
      });
    }
  }, []);

  const handleKeyPress = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;

      if (!currentState.gameStarted || currentState.gameEnded) return;

      // 키 프레스 상태 업데이트 - 키를 눌렀을 때만 눌린 상태로 변경
      setPressedKeys((prev) => {
        if (prev.has(lane)) return prev; // 이미 누른 키는 업데이트 스킵
        
        // 기존 타이머가 있으면 취소
        const existingTimer = keyPressTimersRef.current.get(lane);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        const next = new Set(prev);
        next.add(lane);

        // 키를 뗄 때만 짧게 시간 동안 떼어놓음
        const timer = setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(lane);
            return next;
          });
          keyPressTimersRef.current.delete(lane);
        }, 100); // 100ms 후에 키 떼기
        
        keyPressTimersRef.current.set(lane, timer);

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
        if (timeDiff < bestTimeDiff && timeDiff <= judgeConfig.noteSearchRange) {
          bestTimeDiff = timeDiff;
          bestNote = note;
        }
      }

      if (bestNote) {
        const isHoldNote = bestNote.type === 'hold' || bestNote.duration > 0;
        const judge = judgeTiming(bestNote.time - currentTime);

        // 상태 업데이트를 하나로 묶음
        setGameState((prev) => {
          const newScore = updateScoreFromJudge(judge, prev.score);

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

        // 판정 피드백과 이펙트 추가
        addJudgeFeedback(judge, lane);
      }
    },
    [gameStateRef, setGameState, updateScoreFromJudge, addJudgeFeedback]
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
          const endTime =
            typeof holdNote.endTime === 'number'
              ? holdNote.endTime
              : holdNote.time + (holdNote.duration || 0);
          const timeDiff = Math.abs(endTime - currentTime);
          // 롱노트 판정 윈도우 사용 (일반 판정보다 여유로움)
          const holdReleaseWindow = judgeConfig.holdReleaseWindows.good;
          const isBeforeEnd = currentTime < endTime - holdReleaseWindow;

          if (timeDiff <= holdReleaseWindow) {
            // 롱노트 끝 판정 (롱노트 전용 판정 함수 사용)
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

            // 판정 피드백과 이펙트 추가
            addJudgeFeedback(judge, lane);

            // holdingNotes에서 제거
            next.delete(holdNote.id);
          } else if (isBeforeEnd) {
            // 롱노트를 충분히 유지하기 전에 손을 뗀 경우 Miss 처리
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

            // 판정 피드백 추가 (miss)
            addJudgeFeedback('miss', lane);

            next.delete(holdNote.id);
          }
        }

        return next;
      });
    },
    [gameStateRef, setGameState, processedMissNotes, updateScoreFromJudge, addJudgeFeedback]
  );

  const handleNoteMiss = useCallback(
    (note: Note) => {
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
    },
    [processedMissNotes]
  );

  // 컴포넌트 언마운트 시 모든 타이머 정리
  useEffect(() => {
    return () => {
      // 키 프레스 타이머 정리
      keyPressTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      keyPressTimersRef.current.clear();
      
      // 판정 피드백 타이머 정리
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

