import { useEffect, useRef } from 'react';
import { GameState, Note } from '../types/game';

const GAME_HEIGHT = 800;
const BASE_FALL_DURATION = 2000; // 기본 노트가 떨어지는 시간 (ms)
const JUDGE_LINE_Y = 640; // 판정선 위치

export function useGameLoop(
  gameState: GameState,
  setGameState: (state: GameState | ((prev: GameState) => GameState)) => void,
  onNoteMiss: (note: Note) => void,
  speed: number = 1.0, // 속도 배율 (1.0 = 기본, 높을수록 빠름)
  startDelayMs: number = 0
) {
  const fallDuration = BASE_FALL_DURATION / speed;
  const frameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const delayRef = useRef<number>(startDelayMs);

  useEffect(() => {
    delayRef.current = startDelayMs;
  }, [startDelayMs]);

  useEffect(() => {
    if (!gameState.gameStarted) {
      startTimeRef.current = 0;
      lastTimeRef.current = 0;
      return;
    }

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now() + delayRef.current;
      lastTimeRef.current = startTimeRef.current;
    }

    const animate = (currentTime: number) => {
      if (!gameState.gameStarted) return;

      const elapsedTime = currentTime - startTimeRef.current;
      let missedInFrame: Note[] = [];

      setGameState((prev: GameState) => {
        let missCount = 0;

        const updatedNotes = prev.notes.map((note) => {
          const timeUntilHit = note.time - elapsedTime;

          if (timeUntilHit > fallDuration) {
            return { ...note, y: -100 };
          }

          const progress = 1 - timeUntilHit / fallDuration;
          const y = progress * JUDGE_LINE_Y;

          const isHoldNote = note.duration > 0;
          const missThreshold = isHoldNote
            ? note.endTime - elapsedTime
            : timeUntilHit;

          if (missThreshold < -150 && !note.hit) {
            missCount++;
            missedInFrame.push(note);
            return { ...note, hit: true, y: JUDGE_LINE_Y + 50 };
          }

          return { ...note, y: Math.max(-100, Math.min(GAME_HEIGHT, y)) };
        });

        if (missCount > 0) {
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
        }

        return {
          ...prev,
          notes: updatedNotes,
          currentTime: elapsedTime,
        };
      });

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
  }, [gameState.gameStarted, setGameState, onNoteMiss, speed]);
}
