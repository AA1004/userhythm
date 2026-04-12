import { useEffect, useMemo, useRef } from 'react';
import { Lane } from '../types/game';

const DEFAULT_KEY_BINDINGS = ['D', 'F', 'J', 'K'];

const CODE_TO_KEY: Record<string, string> = {
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E',
  KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J',
  KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N', KeyO: 'O',
  KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T',
  KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y',
  KeyZ: 'Z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Space: ' ',
};

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

    const getKeyFromEvent = (event: KeyboardEvent): string => {
      const fromCode = CODE_TO_KEY[event.code];
      if (fromCode) return fromCode;
      return event.key.toUpperCase();
    };

    const releaseAllPressedKeys = () => {
      pressedLanesRef.current.forEach((lane) => onKeyRelease(lane));
      pressedLanesRef.current.clear();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = getKeyFromEvent(event);
      const lane = keyToLane[key];
      if (lane !== undefined) {
        event.preventDefault();
        pressedLanesRef.current.add(lane);
        onKeyPress(lane);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = getKeyFromEvent(event);
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
