import { Note, Lane } from '../types/game';

/** 롱노트의 최소 길이 (ms) - 이보다 짧으면 탭노트로 변환 */
export const MIN_LONG_NOTE_DURATION = 50;

/**
 * 단일 노트를 검증하고 정규화
 * - 롱노트: duration > 0, endTime = time + duration
 * - 탭노트: duration = 0, endTime = time
 * - 잘못된 롱노트는 탭노트로 변환
 */
export function validateNote(note: Note): Note {
  // 기본 필드 정리
  const cleanedNote: Note = {
    id: note.id,
    lane: note.lane as Lane,
    time: note.time,
    duration: typeof note.duration === 'number' ? note.duration : 0,
    endTime: typeof note.endTime === 'number' ? note.endTime : note.time,
    type: note.type || 'tap',
    y: note.y ?? 0,
    hit: false,
  };

  // 롱노트 검증
  if (cleanedNote.type === 'hold' || cleanedNote.duration > 0) {
    // duration이 0 이하이거나 endTime이 time보다 작거나 같으면 탭 노트로 변환
    if (cleanedNote.duration <= 0 || (cleanedNote.endTime !== undefined && cleanedNote.endTime <= cleanedNote.time)) {
      return {
        ...cleanedNote,
        type: 'tap',
        duration: 0,
        endTime: cleanedNote.time,
      };
    }

    // 최소 길이 미만이면 탭 노트로 변환
    if (cleanedNote.duration < MIN_LONG_NOTE_DURATION) {
      return {
        ...cleanedNote,
        type: 'tap',
        duration: 0,
        endTime: cleanedNote.time,
      };
    }

    // endTime이 올바르게 설정되지 않은 경우 수정
    if (!cleanedNote.endTime || cleanedNote.endTime <= cleanedNote.time) {
      return {
        ...cleanedNote,
        endTime: cleanedNote.time + cleanedNote.duration,
      };
    }

    // endTime과 duration이 일치하지 않는 경우 수정
    const expectedEndTime = cleanedNote.time + cleanedNote.duration;
    if (cleanedNote.endTime !== expectedEndTime) {
      return {
        ...cleanedNote,
        endTime: expectedEndTime,
      };
    }

    return cleanedNote;
  }

  // 탭 노트의 경우 endTime을 time과 동일하게 설정
  return {
    ...cleanedNote,
    type: 'tap',
    duration: 0,
    endTime: cleanedNote.time,
  };
}

/**
 * 노트가 유효한지 확인
 */
export function isValidNote(note: Note): boolean {
  // time이 음수이거나 NaN인 경우 무효
  if (note.time < 0 || isNaN(note.time)) return false;

  // endTime이 time보다 작은 경우 무효
  if (note.endTime < note.time) return false;

  // endTime이 NaN인 경우 무효
  if (isNaN(note.endTime)) return false;

  // duration이 0인데 endTime이 time과 다른 경우 무효 (탭 노트는 endTime === time이어야 함)
  if (note.duration === 0 && note.endTime !== note.time) return false;

  return true;
}

/**
 * 노트 배열을 검증하고 정규화
 * - 각 노트를 검증/정규화
 * - 유효하지 않은 노트 필터링
 * - 시간순 정렬
 */
export function validateNotes(notes: Note[]): Note[] {
  return notes
    .map(validateNote)
    .filter(isValidNote)
    .sort((a, b) => a.time - b.time);
}

/**
 * 유령 노트(ghost notes) 정리
 * - hit 상태 리셋
 * - y 위치 초기화
 */
export function cleanupGhostNotes(notes: Note[]): Note[] {
  return notes.map((note) => ({
    ...note,
    hit: false,
    y: 0,
  }));
}

/**
 * 노트 ID 재할당 (1부터 시작)
 */
export function reassignNoteIds(notes: Note[]): Note[] {
  return notes.map((note, index) => ({
    ...note,
    id: index + 1,
  }));
}

/**
 * 노트 배열에서 최대 ID 찾기
 */
export function getMaxNoteId(notes: Note[]): number {
  return notes.reduce((max, note) => {
    const noteId = typeof note.id === 'number' ? note.id : 0;
    return Math.max(max, noteId);
  }, 0);
}
