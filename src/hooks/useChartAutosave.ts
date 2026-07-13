import { useEffect, useRef } from 'react';

interface UseChartAutosaveOptions<T> {
  key: string;
  data: T;
  onRestore: (data: T) => void;
  debounceMs?: number;
  paused?: boolean;
}

/**
 * localStorage를 사용한 자동 저장 훅
 * 데이터가 변경될 때마다 자동으로 저장하고, 컴포넌트 마운트 시 복원합니다.
 */
export function useChartAutosave<T>(
  keyOrOptions: string | UseChartAutosaveOptions<T>,
  data?: T,
  onRestore?: (data: T) => void,
  debounceMs?: number
): void {
  // 오버로드 지원: 객체 형태 또는 개별 인자
  const options: UseChartAutosaveOptions<T> =
    typeof keyOrOptions === 'string'
      ? {
          key: keyOrOptions,
          data: data!,
          onRestore: onRestore!,
          debounceMs: debounceMs ?? 2000,
        }
      : keyOrOptions;

  const {
    key,
    data: dataValue,
    onRestore: onRestoreValue,
    debounceMs: debounceMsValue = 2000,
    paused = false,
  } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoredRef = useRef(false);
  const previousKeyRef = useRef<string | null>(null);
  const previousDataRef = useRef<T>(dataValue);
  const latestKeyRef = useRef(key);
  const latestDataRef = useRef(dataValue);
  const pausedRef = useRef(paused);
  const dirtyRef = useRef(false);

  latestKeyRef.current = key;
  latestDataRef.current = dataValue;
  pausedRef.current = paused;

  useEffect(() => {
    if (previousKeyRef.current !== key) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      previousKeyRef.current = key;
      isRestoredRef.current = false;
      dirtyRef.current = false;
      previousDataRef.current = dataValue;
    }
  }, [key, dataValue]);

  // key별로 한 번씩 복원
  useEffect(() => {
    if (isRestoredRef.current) return;

    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        onRestoreValue(parsed);
      }
    } catch (error) {
      console.error('Failed to restore from localStorage:', error);
    } finally {
      isRestoredRef.current = true;
    }
  }, [key, onRestoreValue]);

  // 데이터 변경 시 자동 저장 (debounce)
  useEffect(() => {
    if (!isRestoredRef.current) return; // 복원 전에는 저장하지 않음

    if (previousDataRef.current !== dataValue) {
      previousDataRef.current = dataValue;
      dirtyRef.current = true;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (paused || !dirtyRef.current) return;

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (pausedRef.current || !dirtyRef.current) return;

      try {
        localStorage.setItem(latestKeyRef.current, JSON.stringify(latestDataRef.current));
        dirtyRef.current = false;
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }
    }, debounceMsValue);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [key, dataValue, debounceMsValue, paused]);

  // localStorage writes are synchronous, so flush the latest dirty payload when
  // the editor is closed normally even if playback had autosave paused.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (!isRestoredRef.current || !dirtyRef.current) return;

      try {
        localStorage.setItem(latestKeyRef.current, JSON.stringify(latestDataRef.current));
        dirtyRef.current = false;
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }
    };
  }, []);
}


