import { useEffect, useMemo } from 'react';
import { Lane } from '../types/game';

const DEFAULT_KEY_BINDINGS = ['D', 'F', 'J', 'K'];

export function useKeyboard(
  onKeyPress: (lane: Lane) => void,
  onKeyRelease: (lane: Lane) => void,
  enabled: boolean = true,
  keyBindings: string[] = DEFAULT_KEY_BINDINGS
) {
  // 키 바인딩을 lane으로 매핑
  const keyToLane = useMemo(() => {
    const map: Record<string, Lane> = {};
    keyBindings.forEach((key, index) => {
      if (index < 4) {
        map[key.toUpperCase()] = index as Lane;
      }
    });
    return map;
  }, [keyBindings]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toUpperCase();
      const lane = keyToLane[key];
      if (lane !== undefined) {
        event.preventDefault();
        onKeyPress(lane);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      const lane = keyToLane[key];
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
  }, [onKeyPress, onKeyRelease, enabled, keyToLane]);
}
