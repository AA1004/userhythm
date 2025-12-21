import { useState, useCallback, useRef } from 'react';
import { SpeedChange } from '../types/game';

export interface UseSpeedChangesOptions {
  /** 현재 BPM */
  bpm: number;
  /** 시간을 클램핑하는 함수 */
  clampTime: (time: number) => number;
}

export interface UseSpeedChangesReturn {
  speedChanges: SpeedChange[];
  setSpeedChanges: React.Dispatch<React.SetStateAction<SpeedChange[]>>;
  handleAddSpeedChangeAtCurrent: (currentTime: number) => void;
  handleUpdateSpeedChange: (id: number, patch: Partial<SpeedChange>) => void;
  handleDeleteSpeedChange: (id: number) => void;
  restoreSpeedChanges: (data: SpeedChange[]) => void;
  resetSpeedChanges: () => void;
  speedChangeIdRef: React.MutableRefObject<number>;
}

export function useSpeedChanges(options: UseSpeedChangesOptions): UseSpeedChangesReturn {
  const { bpm, clampTime } = options;

  const [speedChanges, setSpeedChanges] = useState<SpeedChange[]>([]);
  const speedChangeIdRef = useRef(0);

  const handleAddSpeedChangeAtCurrent = useCallback((currentTime: number) => {
    const start = clampTime(currentTime);
    const newChange: SpeedChange = {
      id: speedChangeIdRef.current++,
      startTimeMs: start,
      endTimeMs: null,
      bpm,
    };
    setSpeedChanges((prev) =>
      [...prev, newChange].sort((a, b) => a.startTimeMs - b.startTimeMs)
    );
  }, [bpm, clampTime]);

  const handleUpdateSpeedChange = useCallback(
    (id: number, patch: Partial<SpeedChange>) => {
      setSpeedChanges((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, ...patch } : c))
          .sort((a, b) => a.startTimeMs - b.startTimeMs)
      );
    },
    []
  );

  const handleDeleteSpeedChange = useCallback((id: number) => {
    if (!confirm('이 변속 구간을 삭제할까요?')) return;
    setSpeedChanges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const restoreSpeedChanges = useCallback((data: SpeedChange[]) => {
    setSpeedChanges(data);
    const maxId = data.length > 0
      ? Math.max(0, ...data.map((s) => (typeof s.id === 'number' ? s.id : 0)))
      : 0;
    speedChangeIdRef.current = maxId + 1;
  }, []);

  const resetSpeedChanges = useCallback(() => {
    setSpeedChanges([]);
    speedChangeIdRef.current = 0;
  }, []);

  return {
    speedChanges,
    setSpeedChanges,
    handleAddSpeedChangeAtCurrent,
    handleUpdateSpeedChange,
    handleDeleteSpeedChange,
    restoreSpeedChanges,
    resetSpeedChanges,
    speedChangeIdRef,
  };
}
