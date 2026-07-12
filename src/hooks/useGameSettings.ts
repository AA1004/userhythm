import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DEFAULT_KEY_BINDINGS,
  DEFAULT_NOTE_SPEED,
  DISPLAY_NAME_STORAGE_KEY,
  KEY_BINDINGS_STORAGE_KEY,
  NOTE_SPEED_STORAGE_KEY,
  TIMING_OFFSET_MS_STORAGE_KEY,
  BGA_ENABLED_STORAGE_KEY,
  JUDGE_LINE_Y_STORAGE_KEY,
  GAME_VOLUME_STORAGE_KEY,
  JUDGE_LINE_Y,
} from '../constants/gameConstants';
import {
  DEFAULT_GAME_VISUAL_SETTINGS,
  GAME_VISUAL_PRESETS,
  GameVisualSettings,
  normalizeGameVisualSettings,
  VISUAL_SETTINGS_STORAGE_KEY,
  VISUAL_SETTINGS_VERSION,
  VisualPresetId,
} from '../constants/gameVisualSettings';
import { profileAPI, UserProfile } from '../lib/supabaseClient';

const USER_SETTINGS_SYNC_VERSION = 1;
const USER_SETTINGS_SYNC_DEBOUNCE_MS = 900;

interface SyncedUserSettings {
  version: typeof USER_SETTINGS_SYNC_VERSION;
  keyBindings: string[];
  noteSpeed: number;
  timingOffsetMs: number;
  isBgaEnabled: boolean;
  judgeLineY: number;
  gameVolume: number;
  visualSettings: GameVisualSettings;
  updatedAt: string;
}

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readStoredVisualSettings = (): GameVisualSettings => {
  const stored = safeReadLocalStorage(VISUAL_SETTINGS_STORAGE_KEY);
  if (!stored) return DEFAULT_GAME_VISUAL_SETTINGS;

  try {
    const parsed = JSON.parse(stored) as Partial<GameVisualSettings>;
    if (
      parsed.version !== VISUAL_SETTINGS_VERSION &&
      parsed.version !== 1 &&
      parsed.version !== 2 &&
      parsed.version !== 3
      && parsed.version !== 4
      && parsed.version !== 5
    ) {
      console.warn('[settings] Unknown visual settings version. Restoring defaults.', parsed);
      return DEFAULT_GAME_VISUAL_SETTINGS;
    }
    return normalizeGameVisualSettings(parsed);
  } catch (error) {
    console.warn('[settings] Failed to parse visual settings. Restoring defaults.', error);
    return DEFAULT_GAME_VISUAL_SETTINGS;
  }
};

const normalizeKeyBindings = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length !== 4) return [...DEFAULT_KEY_BINDINGS];
  return value.map((key, index) =>
    typeof key === 'string' && key.length > 0 ? key.toUpperCase() : DEFAULT_KEY_BINDINGS[index]
  );
};

const normalizeSyncedUserSettings = (value: unknown): SyncedUserSettings | null => {
  if (!isPlainObject(value)) return null;
  return {
    version: USER_SETTINGS_SYNC_VERSION,
    keyBindings: normalizeKeyBindings(value.keyBindings),
    noteSpeed:
      typeof value.noteSpeed === 'number' && value.noteSpeed >= 0.5 && value.noteSpeed <= 10
        ? value.noteSpeed
        : DEFAULT_NOTE_SPEED,
    timingOffsetMs:
      typeof value.timingOffsetMs === 'number' && value.timingOffsetMs >= -200 && value.timingOffsetMs <= 200
        ? Math.round(value.timingOffsetMs)
        : 0,
    isBgaEnabled: typeof value.isBgaEnabled === 'boolean' ? value.isBgaEnabled : true,
    judgeLineY:
      typeof value.judgeLineY === 'number' && value.judgeLineY >= 200 && value.judgeLineY <= 800
        ? value.judgeLineY
        : JUDGE_LINE_Y,
    gameVolume:
      typeof value.gameVolume === 'number' && value.gameVolume >= 0 && value.gameVolume <= 100
        ? Math.round(value.gameVolume)
        : 30,
    visualSettings: normalizeGameVisualSettings(
      isPlainObject(value.visualSettings) ? value.visualSettings : DEFAULT_GAME_VISUAL_SETTINGS
    ),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
  };
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
  timingOffsetMs: number;
  setTimingOffsetMs: (offsetMs: number) => void;
  isBgaEnabled: boolean;
  setIsBgaEnabled: (enabled: boolean) => void;
  judgeLineY: number;
  setJudgeLineY: (y: number) => void;
  visualSettings: GameVisualSettings;
  draftVisualSettings: GameVisualSettings;
  hasPendingVisualSettings: boolean;
  setDraftVisualSettings: (settings: Partial<GameVisualSettings>) => void;
  commitVisualSettings: (applyToGameplay?: boolean, settingsOverride?: Partial<GameVisualSettings>) => void;
  applyPendingVisualSettings: () => void;
  applyVisualPreset: (presetId: Exclude<VisualPresetId, 'custom'>, applyToGameplay?: boolean) => void;
  resetVisualSettings: (applyToGameplay?: boolean) => void;
  gameVolume: number;
  setGameVolume: (volume: number) => void;
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
        return normalizeKeyBindings(JSON.parse(stored));
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
    return DEFAULT_NOTE_SPEED;
  });
  const [timingOffsetMs, setTimingOffsetMs] = useState<number>(() => {
    const stored = safeReadLocalStorage(TIMING_OFFSET_MS_STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= -200 && parsed <= 200) {
        return parsed;
      }
    }
    return 0;
  });
  const [isBgaEnabled, setIsBgaEnabled] = useState<boolean>(() => {
    const stored = safeReadLocalStorage(BGA_ENABLED_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
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
  const [draftVisualSettings, setDraftVisualSettingsState] = useState<GameVisualSettings>(() =>
    normalizeGameVisualSettings(readStoredVisualSettings(), judgeLineY)
  );
  const [committedVisualSettings, setCommittedVisualSettings] = useState<GameVisualSettings>(() =>
    normalizeGameVisualSettings(readStoredVisualSettings(), judgeLineY)
  );
  const [hasPendingVisualSettings, setHasPendingVisualSettings] = useState(false);
  const [gameVolume, setGameVolume] = useState<number>(() => {
    const stored = safeReadLocalStorage(GAME_VOLUME_STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        return parsed;
      }
    }
    return 30; // 기본값 30%
  });
  const [nextDisplayNameChangeAt, setNextDisplayNameChangeAt] = useState<Date | null>(null);
  const hasLoadedRemoteSettingsRef = useRef(false);
  const isApplyingRemoteSettingsRef = useRef(false);
  const remoteSettingsSaveTimerRef = useRef<number | null>(null);

  const buildSyncedSettings = useCallback(
    (visualOverride?: GameVisualSettings): SyncedUserSettings => ({
      version: USER_SETTINGS_SYNC_VERSION,
      keyBindings: normalizeKeyBindings(keyBindings),
      noteSpeed,
      timingOffsetMs,
      isBgaEnabled,
      judgeLineY,
      gameVolume,
      visualSettings: normalizeGameVisualSettings(visualOverride ?? draftVisualSettings, judgeLineY),
      updatedAt: new Date().toISOString(),
    }),
    [draftVisualSettings, gameVolume, isBgaEnabled, judgeLineY, keyBindings, noteSpeed, timingOffsetMs]
  );

  const applySyncedSettings = useCallback(
    (settings: SyncedUserSettings) => {
      isApplyingRemoteSettingsRef.current = true;
      setKeyBindings(settings.keyBindings);
      setNoteSpeed(settings.noteSpeed);
      setTimingOffsetMs(settings.timingOffsetMs);
      setIsBgaEnabled(settings.isBgaEnabled);
      setJudgeLineY(settings.judgeLineY);
      setGameVolume(settings.gameVolume);
      const normalizedVisual = normalizeGameVisualSettings(settings.visualSettings, settings.judgeLineY);
      setDraftVisualSettingsState(normalizedVisual);
      setCommittedVisualSettings(normalizedVisual);
      setHasPendingVisualSettings(false);
      safeWriteLocalStorage(VISUAL_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedVisual));
      window.setTimeout(() => {
        isApplyingRemoteSettingsRef.current = false;
      }, 0);
    },
    []
  );

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
    safeWriteLocalStorage(TIMING_OFFSET_MS_STORAGE_KEY, String(timingOffsetMs));
  }, [timingOffsetMs]);

  useEffect(() => {
    safeWriteLocalStorage(BGA_ENABLED_STORAGE_KEY, String(isBgaEnabled));
  }, [isBgaEnabled]);

  useEffect(() => {
    safeWriteLocalStorage(JUDGE_LINE_Y_STORAGE_KEY, String(judgeLineY));
  }, [judgeLineY]);

  const visualSettings = useMemo(
    () => normalizeGameVisualSettings(committedVisualSettings, judgeLineY),
    [committedVisualSettings, judgeLineY]
  );

  const normalizedDraftVisualSettings = useMemo(
    () => normalizeGameVisualSettings(draftVisualSettings, judgeLineY),
    [draftVisualSettings, judgeLineY]
  );

  const setDraftVisualSettings = useCallback(
    (settings: Partial<GameVisualSettings>) => {
      setDraftVisualSettingsState((prev) =>
        normalizeGameVisualSettings(
          {
            ...prev,
            ...settings,
            presetId: settings.presetId ?? 'custom',
          },
          judgeLineY
        )
      );
    },
    [judgeLineY]
  );

  const persistVisualSettings = useCallback((settings: GameVisualSettings) => {
    safeWriteLocalStorage(VISUAL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, []);

  const commitVisualSettings = useCallback(
    (applyToGameplay: boolean = true, settingsOverride: Partial<GameVisualSettings> = {}) => {
      const normalized = normalizeGameVisualSettings(
        { ...draftVisualSettings, ...settingsOverride },
        judgeLineY
      );
      setDraftVisualSettingsState(normalized);
      persistVisualSettings(normalized);

      if (applyToGameplay) {
        setCommittedVisualSettings(normalized);
        setHasPendingVisualSettings(false);
      } else {
        setHasPendingVisualSettings(true);
      }
    },
    [draftVisualSettings, judgeLineY, persistVisualSettings]
  );

  const applyPendingVisualSettings = useCallback(() => {
    setCommittedVisualSettings((prev) => {
      const normalized = normalizeGameVisualSettings(draftVisualSettings, judgeLineY);
      return JSON.stringify(prev) === JSON.stringify(normalized) ? prev : normalized;
    });
    setHasPendingVisualSettings(false);
  }, [draftVisualSettings, judgeLineY]);

  const applyVisualPreset = useCallback(
    (presetId: Exclude<VisualPresetId, 'custom'>, applyToGameplay: boolean = true) => {
      const normalized = normalizeGameVisualSettings(GAME_VISUAL_PRESETS[presetId], judgeLineY);
      setDraftVisualSettingsState(normalized);
      persistVisualSettings(normalized);
      if (applyToGameplay) {
        setCommittedVisualSettings(normalized);
        setHasPendingVisualSettings(false);
      } else {
        setHasPendingVisualSettings(true);
      }
    },
    [judgeLineY, persistVisualSettings]
  );

  const resetVisualSettings = useCallback(
    (applyToGameplay: boolean = true) => {
      const normalized = normalizeGameVisualSettings(DEFAULT_GAME_VISUAL_SETTINGS, judgeLineY);
      setDraftVisualSettingsState(normalized);
      persistVisualSettings(normalized);
      if (applyToGameplay) {
        setCommittedVisualSettings(normalized);
        setHasPendingVisualSettings(false);
      } else {
        setHasPendingVisualSettings(true);
      }
    },
    [judgeLineY, persistVisualSettings]
  );

  useEffect(() => {
    safeWriteLocalStorage(GAME_VOLUME_STORAGE_KEY, String(gameVolume));
  }, [gameVolume]);

  useEffect(() => {
    hasLoadedRemoteSettingsRef.current = false;
    if (remoteSettingsSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSettingsSaveTimerRef.current);
      remoteSettingsSaveTimerRef.current = null;
    }
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    if (hasLoadedRemoteSettingsRef.current) return;

    let cancelled = false;
    const loadRemoteSettings = async () => {
      try {
        const remoteSettings =
          normalizeSyncedUserSettings(remoteProfile?.settings) ??
          normalizeSyncedUserSettings(await profileAPI.getSettings());

        if (cancelled) return;
        hasLoadedRemoteSettingsRef.current = true;

        if (remoteSettings) {
          applySyncedSettings(remoteSettings);
          return;
        }

        await profileAPI.updateSettings(buildSyncedSettings());
      } catch (error) {
        hasLoadedRemoteSettingsRef.current = true;
        console.warn('[settings] Failed to sync remote settings. Local settings remain active.', error);
      }
    };

    loadRemoteSettings();

    return () => {
      cancelled = true;
    };
  }, [applySyncedSettings, authUserId, buildSyncedSettings, remoteProfile?.settings]);

  const syncedSettingsSnapshot = useMemo(
    () => buildSyncedSettings(normalizedDraftVisualSettings),
    [buildSyncedSettings, normalizedDraftVisualSettings]
  );

  useEffect(() => {
    if (!authUserId || !hasLoadedRemoteSettingsRef.current || isApplyingRemoteSettingsRef.current) {
      return;
    }

    if (remoteSettingsSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSettingsSaveTimerRef.current);
    }

    remoteSettingsSaveTimerRef.current = window.setTimeout(() => {
      remoteSettingsSaveTimerRef.current = null;
      profileAPI.updateSettings(syncedSettingsSnapshot).catch((error) => {
        console.warn('[settings] Failed to save remote settings. Local settings remain active.', error);
      });
    }, USER_SETTINGS_SYNC_DEBOUNCE_MS);

    return () => {
      if (remoteSettingsSaveTimerRef.current !== null) {
        window.clearTimeout(remoteSettingsSaveTimerRef.current);
        remoteSettingsSaveTimerRef.current = null;
      }
    };
  }, [authUserId, syncedSettingsSnapshot]);

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
    if (!displayName.trim()) return;
    if (!authUserId) {
      alert('닉네임은 로그인 후 저장할 수 있습니다.');
      return;
    }
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
    if (!authUserId) return false;
    if (!nextDisplayNameChangeAt) return true;
    return new Date() >= nextDisplayNameChangeAt;
  }, [authUserId, nextDisplayNameChangeAt]);

  // 레인 키 라벨 (설정된 키 바인딩 사용)
  const laneKeyLabels = useMemo(() => keyBindings.map((k) => [k]), [keyBindings]);

  return {
    displayName,
    setDisplayName,
    keyBindings,
    setKeyBindings,
    noteSpeed,
    setNoteSpeed,
    timingOffsetMs,
    setTimingOffsetMs,
    isBgaEnabled,
    setIsBgaEnabled,
    judgeLineY,
    setJudgeLineY,
    visualSettings,
    draftVisualSettings: normalizedDraftVisualSettings,
    hasPendingVisualSettings,
    setDraftVisualSettings,
    commitVisualSettings,
    applyPendingVisualSettings,
    applyVisualPreset,
    resetVisualSettings,
    gameVolume,
    setGameVolume,
    nextDisplayNameChangeAt,
    setNextDisplayNameChangeAt,
    handleDisplayNameSave,
    handleKeyBindingChange,
    handleResetKeyBindings,
    canChangeDisplayName,
    laneKeyLabels,
  };
}

