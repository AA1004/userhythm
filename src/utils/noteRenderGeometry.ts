import { Note } from '../types/game';
import { NOTE_VISIBILITY_BUFFER_MS } from '../constants/gameConstants';

export const HOLD_MIN_HEIGHT = 60;
export const HOLD_HEAD_HEIGHT = 32;
export const NOTE_SPAWN_Y = -100;
export const NOTE_RENDER_BUFFER = 180;

export interface TapRenderPosition {
  left: number;
  top: number;
}

export interface HoldRenderSegment {
  containerTop: number;
  containerHeight: number;
  visibleTop: number;
  visibleBottom: number;
  holdHeadHeight: number;
}

export const getNoteRenderEndTime = (note: Note) =>
  note.type === 'hold' && note.duration > 0
    ? note.endTime || note.time + note.duration
    : note.time;

export const getNoteViewportStart = (currentTime: number, fallDuration: number) =>
  currentTime - fallDuration - NOTE_VISIBILITY_BUFFER_MS;

export const getNoteViewportEnd = (currentTime: number, fallDuration: number) =>
  currentTime + fallDuration + NOTE_VISIBILITY_BUFFER_MS;

export const getEventY = (
  eventTime: number,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number
) => {
  const progress = 1 - (eventTime - currentTime) / fallDuration;
  return NOTE_SPAWN_Y + progress * (judgeLineY - NOTE_SPAWN_Y);
};

export const computeTapRenderPosition = (
  note: Note,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number,
  laneX: number,
  noteWidth: number,
  noteHeight: number
): TapRenderPosition | null => {
  const y = Math.max(
    NOTE_SPAWN_Y,
    Math.min(judgeLineY, getEventY(note.time, currentTime, fallDuration, judgeLineY))
  );
  const top = y - noteHeight / 2;
  if (top > judgeLineY + NOTE_RENDER_BUFFER || top + noteHeight < -NOTE_RENDER_BUFFER) {
    return null;
  }

  return {
    left: laneX - noteWidth / 2,
    top,
  };
};

export const computeHoldRenderSegment = (
  note: Note,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number,
  noteHeight: number,
  isHolding: boolean,
  viewportHeight: number
): HoldRenderSegment | null => computeHoldRenderSegmentInto(
  note,
  currentTime,
  fallDuration,
  judgeLineY,
  noteHeight,
  isHolding,
  viewportHeight,
  {
    containerTop: 0,
    containerHeight: 0,
    visibleTop: 0,
    visibleBottom: 0,
    holdHeadHeight: 0,
  }
);

export const computeHoldRenderSegmentInto = (
  note: Note,
  currentTime: number,
  fallDuration: number,
  judgeLineY: number,
  noteHeight: number,
  isHolding: boolean,
  viewportHeight: number,
  out: HoldRenderSegment
): HoldRenderSegment | null => {
  const endTime = note.endTime ?? note.time + note.duration;
  const rawHeadY = getEventY(note.time, currentTime, fallDuration, judgeLineY);
  const rawTailY = getEventY(endTime, currentTime, fallDuration, judgeLineY);
  const visualHalfHeight = noteHeight / 2;
  const visualBottomLimitY = judgeLineY + visualHalfHeight;
  const visualTopLimitY = NOTE_SPAWN_Y - visualHalfHeight;

  // Rendering-only rule: timing still uses note.time/endTime; this only controls visuals.
  const headY =
    isHolding && currentTime >= note.time
      ? visualBottomLimitY
      : Math.max(visualTopLimitY, Math.min(visualBottomLimitY, rawHeadY + visualHalfHeight));
  const tailY = Math.max(visualTopLimitY, Math.min(visualBottomLimitY, rawTailY - visualHalfHeight));

  const topY = Math.min(headY, tailY);
  const bottomY = Math.max(headY, tailY);
  const holdHeadHeight = Math.min(HOLD_HEAD_HEIGHT, Math.max(24, noteHeight));
  const fullHeight = Math.max(HOLD_MIN_HEIGHT, bottomY - topY);
  const containerTop = bottomY - fullHeight;
  const containerBottom = containerTop + fullHeight;
  const visibleTop = Math.max(containerTop, -NOTE_RENDER_BUFFER);
  const visibleBottom = Math.min(containerBottom, viewportHeight + NOTE_RENDER_BUFFER);

  if (visibleBottom <= visibleTop) return null;

  out.containerTop = containerTop;
  out.containerHeight = fullHeight;
  out.visibleTop = visibleTop;
  out.visibleBottom = visibleBottom;
  out.holdHeadHeight = holdHeadHeight;
  return out;
};
