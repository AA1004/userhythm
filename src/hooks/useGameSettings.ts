import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEFAULT_KEY_BINDINGS,
  DISPLAY_NAME_STORAGE_KEY,
  KEY_BINDINGS_STORAGE_KEY,
  NOTE_SPEED_STORAGE_KEY,
  BGA_ENABLED_STORAGE_KEY,
  JUDGE_LINE_Y_STORAGE_KEY,
  JUDGE_LINE_Y,
} from '../constants/gameConstants';
import { profileAPI, UserProfile } from '../lib/supabaseClient';

const safeReadLocalStorage = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeWriteLocalStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export interface UseGameSettingsOptions {
  authUserId?: string | null;
  remoteProfile?: UserProfile | null;
}

export interface UseGameSettingsReturn {
  displayName: string;
  setDisplayName: (name: string) => void;
  keyBindings: string[];
  setKeyBindings: React.Dispatch<React.SetStateAction<string[]>>;
  noteSpeed: number;
  setNoteSpeed: (speed: number) => void;
  isBgaEnabled: boolean;
  setIsBgaEnabled: (enabled: boolean) => void;
  judgeLineY: number;
  setJudgeLineY: (y: number) => void;
  nextDisplayNameChangeAt: Date | null;
  setNextDisplayNameChangeAt: (date: Date | null) => void;
  handleDisplayNameSave: () => Promise<void>;
  handleKeyBindingChange: (index: number, key: string) => void;
  handleResetKeyBindings: () => void;
  canChangeDisplayName: boolean;
  laneKeyLabels: string[][];
}

export function useGameSettings(options: UseGameSettingsOptions = {}): UseGameSettingsReturn {
  const { authUserId, remoteProfile } = options;

  const [displayName, setDisplayName] = useState<string>(() => {
    return safeReadLocalStorage(DISPLAY_NAME_STORAGE_KEY) || '';
  });
  const [keyBindings, setKeyBindings] = useState<string[]>(() => {
    const stored = safeReadLocalStorage(KEY_BINDINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 4) {
          return parsed.map((key: string, index: number) => {
            if (typeof key !== 'string' || key.length === 0) {
              return DEFAULT_KEY_BINDINGS[index];
            }
            return key.toUpperCase();
          });
        }
      } catch {
        // ignore
      }
    }
    return [...DEFAULT_KEY_BINDINGS];
  });
  const [noteSpeed, setNoteSpeed] = useState<number>(() => {
    const stored = safeReadLocalStorage(NOTE_SPEED_STORAGE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 10) {
        return parsed;
      }
    }
    return 1.0;
  });
  const [isBgaEnabled, setIsBgaEnabled] = useState<boolean>(() => {
    const stored = safeReadLocalStorage(BGA_ENABLED_STORAGE_KEY);
    return stored === 'true';
  });
  const [judgeLineY, setJudgeLineY] = useState<number>(() => {
    const stored = safeReadLocalStorage(JUDGE_LINE_Y_STORAGE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 200 && parsed <= 800) {
        return parsed;
      }
    }
    return JUDGE_LINE_Y;
  });
  const [nextDisplayNameChangeAt, setNextDisplayNameChangeAt] = useState<Date | null>(null);

  // 설정 로컬 스토리지 저장
  useEffect(() => {
    safeWriteLocalStorage(DISPLAY_NAME_STORAGE_KEY, displayName);
  }, [displayName]);

  useEffect(() => {
    safeWriteLocalStorage(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(keyBindings));
  }, [keyBindings]);

  useEffect(() => {
    safeWriteLocalStorage(NOTE_SPEED_STORAGE_KEY, String(noteSpeed));
  }, [noteSpeed]);

  useEffect(() => {
    safeWriteLocalStorage(BGA_ENABLED_STORAGE_KEY, String(isBgaEnabled));
  }, [isBgaEnabled]);

  useEffect(() => {
    safeWriteLocalStorage(JUDGE_LINE_Y_STORAGE_KEY, String(judgeLineY));
  }, [judgeLineY]);

  // 프로필에서 displayName 동기화
  useEffect(() => {
    if (remoteProfile?.display_name) {
      setDisplayName(remoteProfile.display_name);
    }
    if (remoteProfile?.nickname_updated_at) {
      const nextChange = new Date(new Date(remoteProfile.nickname_updated_at).getTime() + 7 * 24 * 60 * 60 * 1000);
      setNextDisplayNameChangeAt(nextChange);
    }
  }, [remoteProfile]);

  // 닉네임 저장 핸들러
  const handleDisplayNameSave = useCallback(async () => {
    if (!authUserId || !displayName.trim()) return;
    try {
      const result = await profileAPI.updateDisplayName(authUserId, displayName.trim());
      if (result.success) {
        alert('닉네임이 저장되었습니다.');
        setNextDisplayNameChangeAt(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      } else if (result.nextChangeAt) {
        setNextDisplayNameChangeAt(result.nextChangeAt);
        alert(`닉네임은 ${result.nextChangeAt.toLocaleDateString()} 이후에 변경할 수 있습니다.`);
      }
    } catch (error: any) {
      console.error('닉네임 저장 실패:', error);
      alert(error?.message || '닉네임 저장 중 문제가 발생했습니다.');
    }
  }, [authUserId, displayName]);

  // 키 바인딩 변경 핸들러
  const handleKeyBindingChange = useCallback((index: number, key: string) => {
    setKeyBindings((prev) => {
      const next = [...prev];
      next[index] = key;
      return next;
    });
  }, []);

  const handleResetKeyBindings = useCallback(() => {
    setKeyBindings([...DEFAULT_KEY_BINDINGS]);
  }, []);

  // 닉네임 변경 가능 여부
  const canChangeDisplayName = useMemo(() => {
    if (!nextDisplayNameChangeAt) return true;
    return new Date() >= nextDisplayNameChangeAt;
  }, [nextDisplayNameChangeAt]);

  // 레인 키 라벨 (설정된 키 바인딩 사용)
  const laneKeyLabels = useMemo(() => keyBindings.map((k) => [k]), [keyBindings]);

  return {
    displayName,
    setDisplayName,
    keyBindings,
    setKeyBindings,
    noteSpeed,
    setNoteSpeed,
    isBgaEnabled,
    setIsBgaEnabled,
    judgeLineY,
    setJudgeLineY,
    nextDisplayNameChangeAt,
    setNextDisplayNameChangeAt,
    handleDisplayNameSave,
    handleKeyBindingChange,
    handleResetKeyBindings,
    canChangeDisplayName,
    laneKeyLabels,
  };
}

