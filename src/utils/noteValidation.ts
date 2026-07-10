import { Note, Lane } from '../types/game';
import {
  doCanonicalNotesOverlap,
  MIN_LONG_NOTE_DURATION_MS,
  normalizeChartNote,
  removeCanonicalNoteConflicts,
} from '../shared/chartNoteNormalization';

/** 롱노트의 최소 길이 (ms) - 이보다 짧으면 탭노트로 변환 */
export const MIN_LONG_NOTE_DURATION = MIN_LONG_NOTE_DURATION_MS;

/**
 * 단일 노트를 정규화한다. duration이 있으면 legacy endTime보다 우선한다.
 */
export function validateNote(note: Note): Note {
  const normalized = normalizeChartNote(note, note.id);
  return {
    ...normalized,
    lane: normalized.lane as Lane,
    y: note.y ?? 0,
    hit: false,
  };
}

/** 노트가 유효한지 확인 */
export function isValidNote(note: Note): boolean {
  if (note.time < 0 || !Number.isFinite(note.time)) return false;
  if (!Number.isInteger(note.lane) || note.lane < 0 || note.lane > 3) return false;
  if (!Number.isFinite(note.duration) || note.duration < 0) return false;
  if (note.endTime < note.time || !Number.isFinite(note.endTime)) return false;
  if (note.duration === 0 && note.endTime !== note.time) return false;
  return true;
}

/**
 * 같은 레인에서 시간 구간이 겹치는지 확인.
 * 탭 노트는 start=end인 구간으로 취급해서 같은 위치 중복을 막는다.
 */
export function doNotesOverlap(a: Note, b: Note): boolean {
  if (a.id === b.id) return false;
  return doCanonicalNotesOverlap(a, b);
}

export function hasNotePlacementConflict(
  notes: Note[],
  candidate: Note,
  ignoredIds: Set<number> = new Set()
): boolean {
  return notes.some((note) => !ignoredIds.has(note.id) && doNotesOverlap(note, candidate));
}

export function hasAnyNotePlacementConflict(notes: Note[]): boolean {
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if (doNotesOverlap(notes[i], notes[j])) return true;
    }
  }
  return false;
}

export function removeNotePlacementConflicts(notes: Note[]): Note[] {
  return removeCanonicalNoteConflicts(notes);
}

/**
 * 노트 배열을 검증하고 정규화한다.
 * Runtime Set/cursor logic depends on ids following this sorted session order.
 */
export function validateNotes(notes: Note[]): Note[] {
  const normalized = notes
    .map((note, originalIndex) => ({ note: validateNote(note), originalIndex }))
    .filter(({ note }) => isValidNote(note))
    .sort((a, b) => a.note.time - b.note.time || a.originalIndex - b.originalIndex)
    .map(({ note }) => note);

  return removeNotePlacementConflicts(normalized).map((note, index) => ({
    ...note,
    id: index + 1,
    hit: false,
  }));
}

/** 유령 노트 상태를 런타임 초기값으로 되돌린다. */
export function cleanupGhostNotes(notes: Note[]): Note[] {
  return notes.map((note) => ({ ...note, hit: false, y: 0 }));
}

/** 노트 ID 재할당 (1부터 시작) */
export function reassignNoteIds(notes: Note[]): Note[] {
  return notes.map((note, index) => ({ ...note, id: index + 1 }));
}

/** 노트 배열에서 최대 ID 찾기 */
export function getMaxNoteId(notes: Note[]): number {
  return notes.reduce((max, note) => Math.max(max, typeof note.id === 'number' ? note.id : 0), 0);
}
