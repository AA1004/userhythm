import { useEffect, useRef, useMemo } from 'react';
import { GameState, Note } from '../types/game';
import { judgeConfig } from '../config/judgeConfig';

const BASE_FALL_DURATION = 2000; // 기본 노트가 떨어지는 시간 (ms)

export interface GameLoopState {
  currentTime: number; // 게임 시간 (ms)
  gameStarted: boolean;
}

export function useGameLoop(
  gameState: GameState,
  setGameState: (state: GameState | ((prev: GameState) => GameState)) => void,
  onNoteMiss: (note: Note) => void,
  speed: number = 1.0, // 속도 배율 (1.0 = 기본, 높을수록 빠름)
  startDelayMs: number = 0
) {
  // fallDuration을 useMemo로 계산하여 speed 변경 시에만 재계산
  const fallDuration = useMemo(() => BASE_FALL_DURATION / speed, [speed]);
  
  // Miss 판정 기준값을 judgeConfig에서 가져옴
  const missThreshold = judgeConfig.missThreshold;
  const frameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const delayRef = useRef<number>(startDelayMs);
  
  // 게임 시간을 ref에 저장 (렌더링 루프에서 사용)
  const currentTimeRef = useRef<number>(0);
  
  // 게임 상태 ref (미스 판정 시 최신 상태 참조용)
  const gameStateRef = useRef<GameState>(gameState);

  // gameState를 ref로 유지하여 최신 값 참조
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    delayRef.current = startDelayMs;
  }, [startDelayMs]);

  useEffect(() => {
    if (!gameState.gameStarted) {
      startTimeRef.current = 0;
      lastTimeRef.current = 0;
      currentTimeRef.current = 0;
      return;
    }

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now() + delayRef.current;
      lastTimeRef.current = startTimeRef.current;
    }

    const animate = (currentTime: number) => {
      if (!gameStateRef.current.gameStarted) return;

      const elapsedTime = currentTime - startTimeRef.current;
      
      // 게임 시간을 ref에 저장 (렌더링 루프에서 사용)
      currentTimeRef.current = elapsedTime;

      // Miss 판정만 수행 (게임 규칙에 필요한 최소 상태 업데이트)
      const state = gameStateRef.current;
      let missedInFrame: Note[] = [];
      let hasMiss = false;

      for (const note of state.notes) {
        if (note.hit) continue;

        const isHoldNote = note.duration > 0;
        const timeUntilMiss = isHoldNote
          ? note.endTime - elapsedTime
          : note.time - elapsedTime;

        // Miss 판정 (화면을 지나간 노트)
        if (timeUntilMiss < -missThreshold) {
          missedInFrame.push(note);
          hasMiss = true;
        }
      }

      // currentTime 업데이트 주기 (자막/BGA 등에 필요하지만 매 프레임 업데이트는 성능 저하)
      // 60Hz 기준으로 약 16ms마다 업데이트 (약 60Hz)
      const TIME_UPDATE_INTERVAL_MS = 16;
      const timeSinceLastUpdate = elapsedTime - (gameStateRef.current.currentTime || 0);
      const shouldUpdateTime = timeSinceLastUpdate >= TIME_UPDATE_INTERVAL_MS || hasMiss;

      // 미스가 발생한 경우 또는 주기적으로 currentTime 업데이트
      if (shouldUpdateTime) {
        if (hasMiss) {
          setGameState((prev: GameState) => {
            const updatedNotes = prev.notes.map((note) => {
              if (note.hit) return note;
              
              const isHoldNote = note.duration > 0;
              const timeUntilMiss = isHoldNote
                ? note.endTime - elapsedTime
                : note.time - elapsedTime;

              if (timeUntilMiss < -missThreshold) {
                return { ...note, hit: true };
              }
              return note;
            });

            const missCount = missedInFrame.length;
            return {
              ...prev,
              notes: updatedNotes,
              currentTime: elapsedTime,
              score: {
                ...prev.score,
                miss: prev.score.miss + missCount,
                combo: 0,
              },
            };
          });
        } else {
          // 미스는 없지만 currentTime만 업데이트 (자막/BGA 동기화용)
          setGameState((prev: GameState) => ({
            ...prev,
            currentTime: elapsedTime,
          }));
        }
      }

      if (missedInFrame.length && onNoteMiss) {
        missedInFrame.forEach((note) => onNoteMiss(note));
      }

      lastTimeRef.current = currentTime;
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [gameState.gameStarted, setGameState, onNoteMiss, speed, fallDuration, missThreshold]);

  // currentTime ref를 반환하여 렌더링 루프에서 사용
  return {
    currentTimeRef,
    fallDuration,
  };
}

