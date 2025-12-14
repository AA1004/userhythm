import { useEffect, useRef, useMemo } from 'react';
import { GameState, Note } from '../types/game';
import { judgeConfig } from '../config/judgeConfig';

const GAME_HEIGHT = 800;
const BASE_FALL_DURATION = 2000; // 기본 노트가 떨어지는 시간 (ms)
const JUDGE_LINE_Y = 640; // 판정선 위치
const NOTE_SPAWN_Y = -100; // 화면 위(오프스크린)에서 노트가 시작하는 y

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

      // 화면에 보이는 노트 범위 계산
      // 노트가 화면 위에서 보이기 시작: elapsedTime - fallDuration - 200ms (여유분)
      // 노트가 miss 처리되는 시간: elapsedTime + 150ms
      const visibleTimeWindow = fallDuration + 200; // 화면 위에서 보이기 시작하는 시간

      setGameState((prev: GameState) => {
        let missCount = 0;

        const updatedNotes = prev.notes.map((note) => {
          // 이미 hit된 노트는 계산하지 않음 (그대로 유지)
          if (note.hit) {
            return note;
          }

          const timeUntilHit = note.time - elapsedTime;
          
          // 화면 밖 노트 (너무 위에 있어서 아직 보이지 않음) - 계산 스킵
          if (timeUntilHit > visibleTimeWindow) {
            return { ...note, y: NOTE_SPAWN_Y };
          }

          // 화면 내 노트 또는 miss 체크가 필요한 노트만 계산
          const isHoldNote = note.duration > 0;
          const timeUntilMiss = isHoldNote
            ? note.endTime - elapsedTime
            : timeUntilHit;

          // Miss 판정 (화면을 지나간 노트)
          if (timeUntilMiss < -missThreshold) {
            missCount++;
            missedInFrame.push(note);
            return { ...note, hit: true, y: JUDGE_LINE_Y + 50 };
          }

          // 화면 내 노트의 위치 계산
          // 노트가 처음 화면에 나타날 때는 항상 화면 위(NOTE_SPAWN_Y)에서 시작해야 함
          // timeUntilHit >= fallDuration이면 아직 화면 위에 있어야 함
          if (timeUntilHit >= fallDuration) {
            return { ...note, y: NOTE_SPAWN_Y };
          }

          // timeUntilHit < fallDuration이면 이미 화면에 나타나야 하므로 정상 계산
          // 하지만 노트가 처음 나타날 때는 항상 progress = 0이 되도록 보장
          // 즉, timeUntilHit을 fallDuration으로 클램핑하여 progress 계산
          const effectiveTimeUntilHit = Math.min(timeUntilHit, fallDuration);
          const progress = 1 - effectiveTimeUntilHit / fallDuration;
          // 중요: progress=0일 때 y가 NOTE_SPAWN_Y(-100)가 되도록 매핑해야
          // speed(=fallDuration)에 따라 "처음 보이는 위치"가 달라지는 버그가 사라짐.
          const y = NOTE_SPAWN_Y + progress * (JUDGE_LINE_Y - NOTE_SPAWN_Y);

          return { ...note, y: Math.max(NOTE_SPAWN_Y, Math.min(GAME_HEIGHT, y)) };
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
  }, [gameState.gameStarted, setGameState, onNoteMiss, speed, fallDuration, missThreshold]);
}

