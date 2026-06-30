import { useCallback, useEffect, useRef, useMemo, type MutableRefObject } from 'react';
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

const MISS_SCAN_INTERVAL_MS = 1000 / 120;

export interface GameLoopState {
  currentTime: number; // 게임 시간 (ms)
  gameStarted: boolean;
}

export function useGameLoop(
  gameState: GameState,
  _setGameState: (state: GameState | ((prev: GameState) => GameState)) => void,
  onNoteMiss: (note: Note) => 'miss' | 'good' | void,
  speed: number = 1.0, // 속도 배율 (1.0 = 기본, 높을수록 빠름)
  startDelayMs: number = 0,
  externalCurrentTimeRef?: MutableRefObject<number>,
  hitNoteIdsRef?: HitNoteIdsRef,
  timingOffsetMs: number = 0,
  clockEnabled: boolean = true,
  clockDrivenExternally: boolean = false
) {
  // fallDuration을 useMemo로 계산하여 speed 변경 시에만 재계산
  const fallDuration = useMemo(() => BASE_FALL_DURATION / speed, [speed]);
  
  // Miss 판정 기준값을 judgeConfig에서 가져옴
  const missThreshold = judgeConfig.missThreshold;
  const frameRef = useRef<number>();
  const startTimeRef = useRef<number>(0);
  const delayRef = useRef<number>(startDelayMs);
  const missTimerRef = useRef<number | null>(null);
  const missScanIndexRef = useRef<number>(0);
  const missOrderRef = useRef<number[]>([]);
  
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
    missScanIndexRef.current = 0;
    missOrderRef.current = gameState.notes
      .map((_, index) => index)
      .sort((a, b) => getNoteMissDeadline(gameState.notes[a]) - getNoteMissDeadline(gameState.notes[b]));
  }, [gameState.notes]);

  useEffect(() => {
    delayRef.current = startDelayMs;
  }, [startDelayMs]);

  const advanceClock = useCallback(
    (now: number = performance.now()) => {
      if (!gameStateRef.current.gameStarted || !clockEnabled || startTimeRef.current === 0) return;
      currentTimeRef.current = now - startTimeRef.current;
    },
    [clockEnabled, currentTimeRef]
  );

  const scanMisses = useCallback(() => {
    if (!gameStateRef.current.gameStarted || !clockEnabled) return;

    const adjustedJudgeTime = currentTimeRef.current - timingOffsetMs;

    // Miss 판정만 수행 (게임 규칙에 필요한 최소 상태 업데이트)
    const state = gameStateRef.current;
    let missedInFrame: Note[] | null = null;
    let hasMiss = false;
    const shouldProfile = isGameplayProfilerEnabled();
    const missScanStart = shouldProfile ? performance.now() : 0;
    let scannedNotes = 0;
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
        if (!missedInFrame) {
          missedInFrame = [];
        }
        missedInFrame.push(note);
        hasMiss = true;
      }
      missScanIndexRef.current += 1;
    }

    if (shouldProfile) {
      recordGameplayMetric('missScan', performance.now() - missScanStart, scannedNotes);
    }

    if (hasMiss && missedInFrame) {
      let newlyMissed: Note[] = [];
      const hitProcessingStart = shouldProfile ? performance.now() : 0;
      if (hitNoteIdsRef) {
        for (const note of missedInFrame) {
          if (markNoteResolved(note, hitNoteIdsRef)) {
            newlyMissed.push(note);
          }
        }
      } else {
        newlyMissed = missedInFrame;
      }
      if (shouldProfile) {
        recordGameplayMetric('hitProcessing', performance.now() - hitProcessingStart, newlyMissed.length);
      }

      const notesToNotify = hitNoteIdsRef ? newlyMissed : missedInFrame;
      for (const note of notesToNotify) {
        onNoteMiss?.(note);
      }
    }
  }, [clockEnabled, currentTimeRef, hitNoteIdsRef, missThreshold, onNoteMiss, timingOffsetMs]);

  useEffect(() => {
    const isClockRunning = gameState.gameStarted && clockEnabled;
    if (!isClockRunning) {
      startTimeRef.current = 0;
      currentTimeRef.current = gameState.gameStarted ? -delayRef.current : 0;
      missScanIndexRef.current = 0;
      return;
    }

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now() + delayRef.current;
    }

    let disposed = false;

    const runMissTimer = () => {
      if (disposed || !gameStateRef.current.gameStarted || !clockEnabled) return;
      scanMisses();
      missTimerRef.current = window.setTimeout(runMissTimer, MISS_SCAN_INTERVAL_MS);
    };

    const animate = (currentTime: number) => {
      if (!gameStateRef.current.gameStarted || !clockEnabled) return;
      if (clockDrivenExternally) {
        frameRef.current = undefined;
        return;
      }

      advanceClock(currentTime);

      frameRef.current = requestAnimationFrame(animate);
    };

    if (!clockDrivenExternally) {
      frameRef.current = requestAnimationFrame(animate);
      missTimerRef.current = window.setTimeout(runMissTimer, 0);
    }

    return () => {
      disposed = true;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      if (missTimerRef.current !== null) {
        window.clearTimeout(missTimerRef.current);
        missTimerRef.current = null;
      }
    };
  }, [
    gameState.gameStarted,
    onNoteMiss,
    missThreshold,
    hitNoteIdsRef,
    timingOffsetMs,
    clockEnabled,
    clockDrivenExternally,
    advanceClock,
    scanMisses,
  ]);

  // currentTime ref를 반환하여 렌더링 루프에서 사용
  return {
    currentTimeRef,
    fallDuration,
    advanceClock,
    scanMisses,
  };
}

