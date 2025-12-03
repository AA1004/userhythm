import { useEffect, useRef } from 'react';

interface UseChartAutosaveOptions<T> {
  key: string;
  data: T;
  onRestore: (data: T) => void;
  debounceMs?: number;
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
          debounceMs: debounceMs ?? 1000,
        }
      : keyOrOptions;

  const { key, data: dataValue, onRestore: onRestoreValue, debounceMs: debounceMsValue = 1000 } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoredRef = useRef(false);

  // 컴포넌트 마운트 시 복원
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

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(dataValue));
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }
    }, debounceMsValue);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [key, dataValue, debounceMsValue]);
}


