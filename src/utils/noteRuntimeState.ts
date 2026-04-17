import type { MutableRefObject } from 'react';
import { Note } from '../types/game';

export type HitNoteIdsRef = MutableRefObject<Set<number>>;

export const isNoteResolved = (note: Note, hitNoteIdsRef: HitNoteIdsRef): boolean =>
  hitNoteIdsRef.current.has(note.id) || note.hit;

export const markNoteResolved = (note: Note, hitNoteIdsRef: HitNoteIdsRef): boolean => {
  if (isNoteResolved(note, hitNoteIdsRef)) return false;
  hitNoteIdsRef.current.add(note.id);
  return true;
};

