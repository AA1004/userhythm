import { useRef, useCallback } from 'react';

const DEFAULT_MAX_HISTORY_SIZE = 50;

export interface UseChartHistoryOptions {
  maxSize?: number;
}

export interface UseChartHistoryReturn<T> {
  /** 현재 상태를 히스토리에 저장 */
  saveToHistory: (state: T) => void;
  /** 실행 취소 - 이전 상태 반환, 없으면 null */
  undo: () => T | null;
  /** 다시 실행 - 다음 상태 반환, 없으면 null */
  redo: () => T | null;
  /** 실행 취소 가능 여부 */
  canUndo: boolean;
  /** 다시 실행 가능 여부 */
  canRedo: boolean;
  /** 히스토리 초기화 (초기 상태로) */
  reset: (initialState: T) => void;
  /** 현재 히스토리 인덱스 */
  currentIndex: number;
  /** 히스토리 길이 */
  historyLength: number;
}

/**
 * 실행 취소/다시 실행 기능을 제공하는 히스토리 관리 훅
 *
 * @example
 * const history = useChartHistory<Note[]>({ maxSize: 50 });
 *
 * // 상태 변경 시 저장
 * history.saveToHistory(newNotes);
 *
 * // 실행 취소
 * const prevState = history.undo();
 * if (prevState) setNotes(prevState);
 */
export function useChartHistory<T>(
  options: UseChartHistoryOptions = {}
): UseChartHistoryReturn<T> {
  const { maxSize = DEFAULT_MAX_HISTORY_SIZE } = options;

  const historyRef = useRef<T[]>([]);
  const indexRef = useRef<number>(-1);

  const saveToHistory = useCallback((state: T) => {
    const history = historyRef.current;
    const index = indexRef.current;

    // 현재 인덱스 이후의 히스토리 제거 (새로운 변경이 있으면)
    const newHistory = history.slice(0, index + 1);

    // 새 상태 추가 (깊은 복사를 위해 JSON 사용 또는 배열 spread)
    const stateCopy = Array.isArray(state) ? [...state] as T : state;
    newHistory.push(stateCopy);

    // 최대 크기 제한
    if (newHistory.length > maxSize) {
      newHistory.shift();
      indexRef.current = newHistory.length - 1;
    } else {
      indexRef.current = newHistory.length - 1;
    }

    historyRef.current = newHistory;
  }, [maxSize]);

  const undo = useCallback((): T | null => {
    const history = historyRef.current;
    const index = indexRef.current;

    if (index > 0) {
      indexRef.current = index - 1;
      const state = history[index - 1];
      return Array.isArray(state) ? [...state] as T : state;
    }
    return null;
  }, []);

  const redo = useCallback((): T | null => {
    const history = historyRef.current;
    const index = indexRef.current;

    if (index < history.length - 1) {
      indexRef.current = index + 1;
      const state = history[index + 1];
      return Array.isArray(state) ? [...state] as T : state;
    }
    return null;
  }, []);

  const reset = useCallback((initialState: T) => {
    const stateCopy = Array.isArray(initialState) ? [...initialState] as T : initialState;
    historyRef.current = [stateCopy];
    indexRef.current = 0;
  }, []);

  return {
    saveToHistory,
    undo,
    redo,
    canUndo: indexRef.current > 0,
    canRedo: indexRef.current < historyRef.current.length - 1,
    reset,
    currentIndex: indexRef.current,
    historyLength: historyRef.current.length,
  };
}
