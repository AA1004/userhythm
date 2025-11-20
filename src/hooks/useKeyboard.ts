import { useEffect, useCallback } from 'react';
import { Lane } from '../types/game';

const KEY_MAP: Record<string, Lane> = {
  'd': 0,
  'f': 1,
  'j': 2,
  'k': 3,
};

export function useKeyboard(
  onKeyPress: (lane: Lane) => void,
  enabled: boolean
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      
      const lane = KEY_MAP[event.key.toLowerCase()];
      if (lane !== undefined) {
        event.preventDefault();
        onKeyPress(lane);
      }
    },
    [onKeyPress, enabled]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [enabled, handleKeyDown]);
}

