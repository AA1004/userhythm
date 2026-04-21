const CODE_TO_KEY: Record<string, string> = {
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E',
  KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J',
  KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N', KeyO: 'O',
  KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T',
  KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y',
  KeyZ: 'Z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Space: 'SPACE',
};

const NUMPAD_CODE_TO_KEY: Record<string, string> = {
  Numpad0: 'NUM0',
  Numpad1: 'NUM1',
  Numpad2: 'NUM2',
  Numpad3: 'NUM3',
  Numpad4: 'NUM4',
  Numpad5: 'NUM5',
  Numpad6: 'NUM6',
  Numpad7: 'NUM7',
  Numpad8: 'NUM8',
  Numpad9: 'NUM9',
  NumpadAdd: 'NUM+',
  NumpadSubtract: 'NUM-',
  NumpadMultiply: 'NUM*',
  NumpadDivide: 'NUM/',
  NumpadDecimal: 'NUM.',
  NumpadComma: 'NUM,',
};

const EXCLUDED_CODES = new Set(['NumpadEnter', 'NumLock']);

const ALLOWED_NON_CHAR_KEYS = new Set([
  'ARROWUP',
  'ARROWDOWN',
  'ARROWLEFT',
  'ARROWRIGHT',
  'SPACE',
]);

type KeyInput = {
  code: string;
  key: string;
};

export const getKeyBindingFromInput = (input: KeyInput): string | null => {
  if (EXCLUDED_CODES.has(input.code)) {
    return null;
  }

  const numpadMapped = NUMPAD_CODE_TO_KEY[input.code];
  if (numpadMapped) {
    return numpadMapped;
  }

  const codeMapped = CODE_TO_KEY[input.code];
  if (codeMapped) {
    return codeMapped;
  }

  const normalizedKey = input.key === ' ' ? 'SPACE' : input.key.toUpperCase();
  if (normalizedKey.length === 1 || ALLOWED_NON_CHAR_KEYS.has(normalizedKey)) {
    return normalizedKey;
  }

  return null;
};
