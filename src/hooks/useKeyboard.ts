import { useEffect } from 'react';
import { Lane } from '../types/game';

const KEY_TO_LANE: Record<string, Lane> = {
  D: 0,
  F: 1,
  J: 2,
  K: 3,
};

export function useKeyboard(
  onKeyPress: (lane: Lane) => void,
  onKeyRelease: (lane: Lane) => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toUpperCase();
      const lane = KEY_TO_LANE[key];
      if (lane !== undefined) {
        event.preventDefault();
        onKeyPress(lane);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      const lane = KEY_TO_LANE[key];
      if (lane !== undefined) {
        event.preventDefault();
        onKeyRelease(lane);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onKeyPress, onKeyRelease, enabled]);
}
