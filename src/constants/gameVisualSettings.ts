import { JUDGE_LINE_Y } from './gameConstants';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from './gameLayout';

export const VISUAL_SETTINGS_VERSION = 1;
export const VISUAL_SETTINGS_STORAGE_KEY = 'RHYTHM_GAME_VISUAL_SETTINGS';
export const LANE_COUNT = 4;
export const KEY_LANE_HEIGHT = 100;

export type VisualPresetId = 'classic' | 'compact' | 'wide' | 'custom';

export interface GameVisualSettings {
  version: typeof VISUAL_SETTINGS_VERSION;
  presetId: VisualPresetId;
  laneWidth: number;
  laneGap: number;
  laneOffsetX: number;
  keyLaneY: number;
  noteWidth: number;
  noteHeight: number;
}

export interface PlayfieldGeometry {
  laneWidth: number;
  laneGap: number;
  laneOffsetX: number;
  laneGroupLeft: number;
  laneGroupWidth: number;
  laneCenters: readonly number[];
  laneEdges: readonly number[];
  judgeLineLeft: number;
  judgeLineWidth: number;
  keyLaneY: number;
  noteWidth: number;
  noteHeight: number;
}

export const VISUAL_SETTING_LIMITS = {
  laneWidth: { min: 70, max: 115 },
  laneGap: { min: 0, max: 28 },
  noteWidth: { min: 48 },
  noteHeight: { min: 28, max: 56 },
  keyLaneY: { minGapFromJudgeLine: 40 },
} as const;

export const DEFAULT_GAME_VISUAL_SETTINGS: GameVisualSettings = {
  version: VISUAL_SETTINGS_VERSION,
  presetId: 'classic',
  laneWidth: 100,
  laneGap: 0,
  laneOffsetX: 0,
  keyLaneY: 700,
  noteWidth: 90,
  noteHeight: 42,
};

export const GAME_VISUAL_PRESETS: Record<Exclude<VisualPresetId, 'custom'>, GameVisualSettings> = {
  classic: DEFAULT_GAME_VISUAL_SETTINGS,
  compact: {
    version: VISUAL_SETTINGS_VERSION,
    presetId: 'compact',
    laneWidth: 84,
    laneGap: 6,
    laneOffsetX: 0,
    keyLaneY: 700,
    noteWidth: 76,
    noteHeight: 38,
  },
  wide: {
    version: VISUAL_SETTINGS_VERSION,
    presetId: 'wide',
    laneWidth: 108,
    laneGap: 4,
    laneOffsetX: 0,
    keyLaneY: 700,
    noteWidth: 96,
    noteHeight: 46,
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const getLaneGroupWidth = (laneWidth: number, laneGap: number) =>
  LANE_COUNT * laneWidth + (LANE_COUNT - 1) * laneGap;

export const normalizeGameVisualSettings = (
  value: Partial<GameVisualSettings> | null | undefined,
  judgeLineY: number = JUDGE_LINE_Y
): GameVisualSettings => {
  const raw = value ?? DEFAULT_GAME_VISUAL_SETTINGS;
  const fallback = DEFAULT_GAME_VISUAL_SETTINGS;

  let laneWidth = clamp(
    finiteOr(raw.laneWidth, fallback.laneWidth),
    VISUAL_SETTING_LIMITS.laneWidth.min,
    VISUAL_SETTING_LIMITS.laneWidth.max
  );
  let laneGap = clamp(
    finiteOr(raw.laneGap, fallback.laneGap),
    VISUAL_SETTING_LIMITS.laneGap.min,
    VISUAL_SETTING_LIMITS.laneGap.max
  );

  const maxGroupWidth = GAME_VIEW_WIDTH;
  if (getLaneGroupWidth(laneWidth, laneGap) > maxGroupWidth) {
    laneWidth = Math.floor((maxGroupWidth - (LANE_COUNT - 1) * laneGap) / LANE_COUNT);
    laneWidth = clamp(laneWidth, VISUAL_SETTING_LIMITS.laneWidth.min, VISUAL_SETTING_LIMITS.laneWidth.max);
    if (getLaneGroupWidth(laneWidth, laneGap) > maxGroupWidth) {
      laneGap = 0;
    }
  }

  const laneGroupWidth = getLaneGroupWidth(laneWidth, laneGap);
  const maxOffset = Math.max(0, (GAME_VIEW_WIDTH - laneGroupWidth) / 2);
  const laneOffsetX = clamp(finiteOr(raw.laneOffsetX, fallback.laneOffsetX), -maxOffset, maxOffset);

  const noteWidth = clamp(
    finiteOr(raw.noteWidth, fallback.noteWidth),
    VISUAL_SETTING_LIMITS.noteWidth.min,
    laneWidth
  );
  const noteHeight = clamp(
    finiteOr(raw.noteHeight, fallback.noteHeight),
    VISUAL_SETTING_LIMITS.noteHeight.min,
    VISUAL_SETTING_LIMITS.noteHeight.max
  );

  // judgeLineY controls the timing line and note destination.
  // keyLaneY controls only the visual key boxes and is kept below judgeLineY when possible.
  const maxKeyLaneY = GAME_VIEW_HEIGHT - KEY_LANE_HEIGHT;
  const minKeyLaneY = Math.min(
    maxKeyLaneY,
    judgeLineY + VISUAL_SETTING_LIMITS.keyLaneY.minGapFromJudgeLine
  );
  const keyLaneY = clamp(finiteOr(raw.keyLaneY, fallback.keyLaneY), minKeyLaneY, maxKeyLaneY);

  const presetId: VisualPresetId =
    raw.presetId === 'compact' || raw.presetId === 'wide' || raw.presetId === 'custom'
      ? raw.presetId
      : 'classic';

  return {
    version: VISUAL_SETTINGS_VERSION,
    presetId,
    laneWidth,
    laneGap,
    laneOffsetX,
    keyLaneY,
    noteWidth,
    noteHeight,
  };
};

export const buildPlayfieldGeometry = (
  settings: Partial<GameVisualSettings> | null | undefined,
  judgeLineY: number = JUDGE_LINE_Y
): PlayfieldGeometry => {
  const normalized = normalizeGameVisualSettings(settings, judgeLineY);
  const laneGroupWidth = getLaneGroupWidth(normalized.laneWidth, normalized.laneGap);

  // laneOffsetX moves the whole lane group from the stage center, clamped so the group stays visible.
  const centeredLeft = (GAME_VIEW_WIDTH - laneGroupWidth) / 2;
  const laneGroupLeft = centeredLeft + normalized.laneOffsetX;
  const laneCenters = Array.from({ length: LANE_COUNT }, (_, index) =>
    laneGroupLeft +
    normalized.laneWidth / 2 +
    index * (normalized.laneWidth + normalized.laneGap)
  );
  const laneEdges = [
    ...Array.from({ length: LANE_COUNT }, (_, index) =>
      laneGroupLeft + index * (normalized.laneWidth + normalized.laneGap)
    ),
    laneGroupLeft + laneGroupWidth,
  ];

  return {
    laneWidth: normalized.laneWidth,
    laneGap: normalized.laneGap,
    laneOffsetX: normalized.laneOffsetX,
    laneGroupLeft,
    laneGroupWidth,
    laneCenters,
    laneEdges,
    judgeLineLeft: laneGroupLeft,
    judgeLineWidth: laneGroupWidth,
    keyLaneY: normalized.keyLaneY,
    noteWidth: normalized.noteWidth,
    noteHeight: normalized.noteHeight,
  };
};
