import { useEffect, useRef, useMemo, type MutableRefObject } from 'react';
import { GameState, Note } from '../types/game';
import { judgeConfig } from '../config/judgeConfig';
import { BASE_FALL_DURATION } from '../constants/gameConstants';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import {
  HitNoteIdsRef,
  isNoteResolved,
  markNoteResolved,
} from '../utils/noteRuntimeState';

const getNoteMissDeadline = (note: Note) =>
  note.duration > 0 ? note.endTime ?? note.time + note.duration : note.time;

const getNotesSignature = (notes: Note[]) => {
  const first = notes[0];
  const last = notes[notes.length - 1];
  return `${notes.length}:${first?.id ?? 'none'}:${first?.time ?? 0}:${last?.id ?? 'none'}:${last?.time ?? 0}`;
};

export interface GameLoopState {
  currentTime: number; // 게임 시간 (ms)
  gameStarted: boolean;
}

export function useGameLoop(
  gameState: GameState,
  setGameState: (state: GameState | ((prev: GameState) => GameState)) => void,
  onNoteMiss: (note: Note) => 'miss' | 'good' | void,
  speed: number = 1.0, // 속도 배율 (1.0 = 기본, 높을수록 빠름)
  startDelayMs: number = 0,
  externalCurrentTimeRef?: MutableRefObject<number>,
  hitNoteIdsRef?: HitNoteIdsRef,
  timingOffsetMs: number = 0,
  clockEnabled: boolean = true
) {
  // fallDuration을 useMemo로 계산하여 speed 변경 시에만 재계산
  const fallDuration = useMemo(() => BASE_FALL_DURATION / speed, [speed]);
  
  // Miss 판정 기준값을 judgeConfig에서 가져옴
  const missThreshold = judgeConfig.missThreshold;
  const frameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const delayRef = useRef<number>(startDelayMs);
  const missScanIndexRef = useRef<number>(0);
  const missOrderRef = useRef<number[]>([]);
  const notesSignatureRef = useRef<string>('');
  
  // 게임 시간을 ref에 저장 (렌더링 루프에서 사용)
  const internalCurrentTimeRef = useRef<number>(0);
  const currentTimeRef = externalCurrentTimeRef ?? internalCurrentTimeRef;
  
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
    const isClockRunning = gameState.gameStarted && clockEnabled;
    if (!isClockRunning) {
      startTimeRef.current = 0;
      lastTimeRef.current = 0;
      currentTimeRef.current = gameState.gameStarted ? -delayRef.current : 0;
      missScanIndexRef.current = 0;
      return;
    }

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now() + delayRef.current;
      lastTimeRef.current = startTimeRef.current;
    }

    const animate = (currentTime: number) => {
      if (!gameStateRef.current.gameStarted || !clockEnabled) return;

      const elapsedTime = currentTime - startTimeRef.current;
      const adjustedJudgeTime = elapsedTime - timingOffsetMs;
      
      // 게임 시간을 ref에 저장 (렌더링 루프에서 사용)
      currentTimeRef.current = elapsedTime;

      // Miss 판정만 수행 (게임 규칙에 필요한 최소 상태 업데이트)
      const state = gameStateRef.current;
      let missedInFrame: Note[] = [];
      let hasMiss = false;
      const shouldProfile = isGameplayProfilerEnabled();
      const missScanStart = shouldProfile ? performance.now() : 0;
      let scannedNotes = 0;
      const notesSignature = getNotesSignature(state.notes);
      if (notesSignatureRef.current !== notesSignature) {
        notesSignatureRef.current = notesSignature;
        missScanIndexRef.current = 0;
        missOrderRef.current = state.notes
          .map((_, index) => index)
          .sort((a, b) => getNoteMissDeadline(state.notes[a]) - getNoteMissDeadline(state.notes[b]));
      }

      const missOrder = missOrderRef.current;
      while (missScanIndexRef.current < missOrder.length) {
        const noteIndex = missOrder[missScanIndexRef.current];
        const note = state.notes[noteIndex];
        scannedNotes += 1;
        if (!note) {
          missScanIndexRef.current += 1;
          continue;
        }

        const timeUntilMiss = getNoteMissDeadline(note) - adjustedJudgeTime;
        if (timeUntilMiss >= -missThreshold) break;

        const isResolved = hitNoteIdsRef
          ? isNoteResolved(note, hitNoteIdsRef)
          : note.hit;
        if (!isResolved) {
          missedInFrame.push(note);
          hasMiss = true;
        }
        missScanIndexRef.current += 1;
      }

      if (shouldProfile) {
        recordGameplayMetric('missScan', performance.now() - missScanStart, scannedNotes);
      }

      // currentTimeRef is the gameplay clock. React state only changes for gameplay events.
      if (!hasMiss) {
        // state 업데이트 없이 다음 프레임으로
        lastTimeRef.current = currentTime;
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      let newlyMissed: Note[] = [];
      if (hasMiss) {
        const hitProcessingStart = shouldProfile ? performance.now() : 0;
        if (hitNoteIdsRef) {
          for (const note of missedInFrame) {
            if (markNoteResolved(note, hitNoteIdsRef)) {
              newlyMissed.push(note);
            }
          }
        } else {
          newlyMissed.push(...missedInFrame);
        }
        if (shouldProfile) {
          recordGameplayMetric('hitProcessing', performance.now() - hitProcessingStart, newlyMissed.length);
        }
      }

      if (hasMiss) {
        const notesToNotify = hitNoteIdsRef ? newlyMissed : missedInFrame;
        notesToNotify.forEach((note) => {
          onNoteMiss?.(note);
        });
        setGameState((prev: GameState) => {
          return {
            ...prev,
            currentTime: elapsedTime,
          };
        });
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
  }, [gameState.gameStarted, setGameState, onNoteMiss, speed, fallDuration, missThreshold, hitNoteIdsRef, timingOffsetMs, clockEnabled]);

  // currentTime ref를 반환하여 렌더링 루프에서 사용
  return {
    currentTimeRef,
    fallDuration,
  };
}

