export const MIN_LONG_NOTE_DURATION_MS = 50;
export const NOTE_OVERLAP_EPSILON_MS = 0.5;

export type CanonicalNoteType = 'tap' | 'hold';

export interface ChartNoteNormalizationInput<LaneType = number> {
  lane: LaneType;
  time: number;
  duration?: number;
  endTime?: number;
  type?: unknown;
}

export interface CanonicalChartNote<LaneType = number> {
  id: number;
  lane: LaneType;
  time: number;
  duration: number;
  endTime: number;
  type: CanonicalNoteType;
}

/** Both runtime and server use the same duration-first legacy compatibility rule. */
export function normalizeChartNote<LaneType>(
  input: ChartNoteNormalizationInput<LaneType>,
  id: number
): CanonicalChartNote<LaneType> {
  const rawDuration = Number.isFinite(input.duration) ? Math.max(0, input.duration as number) : 0;
  const derivedDuration = Number.isFinite(input.endTime) && (input.endTime as number) > input.time
    ? (input.endTime as number) - input.time
    : 0;
  const duration = rawDuration > 0 ? rawDuration : derivedDuration;

  if (duration < MIN_LONG_NOTE_DURATION_MS) {
    return { id, lane: input.lane, time: input.time, duration: 0, endTime: input.time, type: 'tap' };
  }

  return {
    id,
    lane: input.lane,
    time: input.time,
    duration,
    endTime: input.time + duration,
    type: 'hold',
  };
}

export function doCanonicalNotesOverlap<LaneType>(
  left: Pick<CanonicalChartNote<LaneType>, 'lane' | 'time' | 'endTime' | 'type'>,
  right: Pick<CanonicalChartNote<LaneType>, 'lane' | 'time' | 'endTime' | 'type'>
): boolean {
  if (left.lane !== right.lane) return false;

  const leftEnd = left.type === 'hold' ? Math.max(left.time, left.endTime) : left.time;
  const rightEnd = right.type === 'hold' ? Math.max(right.time, right.endTime) : right.time;
  return (
    left.time <= rightEnd + NOTE_OVERLAP_EPSILON_MS &&
    right.time <= leftEnd + NOTE_OVERLAP_EPSILON_MS
  );
}

/** Notes must already be stable-sorted by time and original input order. */
export function removeCanonicalNoteConflicts<LaneType, NoteType extends CanonicalChartNote<LaneType>>(
  notes: readonly NoteType[]
): NoteType[] {
  const accepted: NoteType[] = [];
  const lastAcceptedByLane = new Map<LaneType, NoteType>();

  for (const note of notes) {
    const previous = lastAcceptedByLane.get(note.lane);
    if (previous && doCanonicalNotesOverlap(previous, note)) continue;

    accepted.push(note);
    lastAcceptedByLane.set(note.lane, note);
  }

  return accepted;
}
