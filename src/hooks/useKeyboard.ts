import { useEffect, useMemo, useRef } from 'react';
import { Lane } from '../types/game';
import { getKeyBindingFromInput } from '../utils/keyBinding';

const DEFAULT_KEY_BINDINGS = ['D', 'F', 'J', 'K'];

export function useKeyboard(
  onKeyPress: (lane: Lane) => void,
  onKeyRelease: (lane: Lane) => void,
  enabled: boolean = true,
  keyBindings: string[] = DEFAULT_KEY_BINDINGS
) {
  const pressedLanesRef = useRef<Set<Lane>>(new Set());

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
    if (!enabled) {
      pressedLanesRef.current.clear();
      return;
    }

    const releaseAllPressedKeys = () => {
      pressedLanesRef.current.forEach((lane) => onKeyRelease(lane));
      pressedLanesRef.current.clear();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = getKeyBindingFromInput(event);
      if (!key) return;
      const lane = keyToLane[key];
      if (lane !== undefined) {
        event.preventDefault();
        pressedLanesRef.current.add(lane);
        onKeyPress(lane);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = getKeyBindingFromInput(event);
      if (!key) return;
      const lane = keyToLane[key];
      if (lane !== undefined) {
        event.preventDefault();
        pressedLanesRef.current.delete(lane);
        onKeyRelease(lane);
      }
    };

    const handleWindowBlur = () => {
      releaseAllPressedKeys();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        releaseAllPressedKeys();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseAllPressedKeys();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onKeyPress, onKeyRelease, enabled, keyToLane]);
}
