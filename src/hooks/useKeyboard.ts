import { useEffect, useMemo } from 'react';
import { Lane } from '../types/game';

const DEFAULT_KEY_BINDINGS = ['D', 'F', 'J', 'K'];

// KeyboardEvent.code를 문자로 변환 (한/영 상관없이 물리적 키 위치 기반)
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

    const getKeyFromEvent = (event: KeyboardEvent): string => {
      // 물리적 키 위치(code)를 우선 사용하여 한/영 상관없이 동작
      const fromCode = CODE_TO_KEY[event.code];
      if (fromCode) return fromCode;
      // code 매핑이 없으면 key 사용 (fallback)
      return event.key.toUpperCase();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = getKeyFromEvent(event);
      const lane = keyToLane[key];
      if (lane !== undefined) {
        event.preventDefault();
        onKeyPress(lane);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = getKeyFromEvent(event);
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
