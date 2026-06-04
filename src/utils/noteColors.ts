import { Lane } from '../types/game';
import { NoteColorRgb } from '../constants/gameVisualSettings';

export type { NoteColorRgb } from '../constants/gameVisualSettings';

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const normalizeNoteColor = (
  value: Partial<NoteColorRgb> | null | undefined,
  fallback: NoteColorRgb
): NoteColorRgb => ({
  r: clampChannel(typeof value?.r === 'number' ? value.r : fallback.r),
  g: clampChannel(typeof value?.g === 'number' ? value.g : fallback.g),
  b: clampChannel(typeof value?.b === 'number' ? value.b : fallback.b),
});

export const mixNoteColor = (base: NoteColorRgb, target: number, amount: number): NoteColorRgb => ({
  r: clampChannel(base.r + (target - base.r) * amount),
  g: clampChannel(base.g + (target - base.g) * amount),
  b: clampChannel(base.b + (target - base.b) * amount),
});

export const darkenNoteColor = (base: NoteColorRgb, amount: number) =>
  mixNoteColor(base, 0, amount);

export const lightenNoteColor = (base: NoteColorRgb, amount: number) =>
  mixNoteColor(base, 255, amount);

export const noteColorToRgba = (color: NoteColorRgb, alpha = 1) =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

export const noteColorKey = (color: NoteColorRgb) => `${color.r}-${color.g}-${color.b}`;

export const getLaneNoteColor = (
  lane: Lane,
  outerLaneNoteColor: NoteColorRgb,
  innerLaneNoteColor: NoteColorRgb
) => (lane === 0 || lane === 3 ? outerLaneNoteColor : innerLaneNoteColor);
