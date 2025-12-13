import { useState, useRef, useCallback } from 'react';
import { Lane, Note, JudgeType, GameState } from '../types/game';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { LANE_POSITIONS, JUDGE_LINE_Y } from '../constants/gameConstants';

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
        const isHoldNote = bestNote.type === 'hold' || bestNote.duration > 0;
        const judge = judgeTiming(bestNote.time - currentTime);

        // 상태 업데이트를 하나로 묶음
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
          const effectY = JUDGE_LINE_Y;
          setKeyEffects((prev) => [...prev, { id: effectId, lane, x: effectX, y: effectY }]);

          // 피드백 제거와 이펙트 제거를 requestAnimationFrame으로 처리하여 렌더링 최적화
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
              setKeyEffects((prev) => prev.filter((e) => e.id !== effectId));
            }, 800);
          });
        } else {
          // miss인 경우 이펙트 없이 피드백만 제거
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
            }, 800);
          });
        }
      }
    },
    [gameStateRef, setGameState]
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
              const effectY = JUDGE_LINE_Y;
              setKeyEffects((prevEffects) => [
                ...prevEffects,
                { id: effectId, lane, x: effectX, y: effectY },
              ]);

              requestAnimationFrame(() => {
                setTimeout(() => {
                  setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
                  setKeyEffects((prev) => prev.filter((e) => e.id !== effectId));
                }, 800);
              });
            } else {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
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
    [gameStateRef, setGameState, processedMissNotes]
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

