import { useState, useCallback, useRef, useMemo } from 'react';
import { Note, Lane } from '../types/game';
import { MIN_LONG_NOTE_DURATION } from '../utils/noteValidation';

export interface UseChartNotesOptions {
  /** 히스토리에 저장하는 콜백 */
  saveToHistory?: (notes: Note[]) => void;
  /** 이동 모드 여부 (삭제 방지) */
  isMoveMode?: boolean;
}

export interface UseChartNotesReturn {
  /** 현재 노트 배열 */
  notes: Note[];
  /** 노트 배열 설정 */
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;

  /** 노트 추가 */
  addNote: (lane: Lane, time: number, type?: 'tap' | 'hold', duration?: number) => void;
  /** 노트 삭제 */
  deleteNote: (id: number) => void;
  /** 선택된 노트들 삭제 */
  deleteSelectedNotes: (selectedIds: Set<number>) => void;
  /** 선대칭 반전 (레인 0↔3, 1↔2) */
  mirrorNotes: (selectedIds: Set<number>) => void;

  /** 노트 붙여넣기 */
  pasteNotes: (copiedNotes: Note[], currentTime: number) => void;

  /** 노트 이동 적용 */
  applyMove: (
    selectedIds: Set<number>,
    offset: { time: number; lane: number },
    snapToGrid: (time: number) => number
  ) => void;

  /** 시간순 정렬된 노트 */
  sortedNotes: Note[];

  /** 다음 노트 ID */
  nextNoteId: number;
  /** 노트 ID 리셋 (복원 시 사용) */
  resetNoteIdCounter: (maxId: number) => void;
}

/**
 * 채보 에디터의 노트 CRUD 관리 훅
 */
export function useChartNotes(options: UseChartNotesOptions = {}): UseChartNotesReturn {
  const { saveToHistory, isMoveMode = false } = options;

  const [notes, setNotes] = useState<Note[]>([]);
  const noteIdRef = useRef<number>(1);

  // 시간순 정렬된 노트
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => a.time - b.time);
  }, [notes]);

  // 노트 추가
  const addNote = useCallback((
    lane: Lane,
    time: number,
    type: 'tap' | 'hold' = 'tap',
    duration: number = 0
  ) => {
    // 롱노트 검증
    let finalType = type;
    let finalDuration = duration;

    if (type === 'hold') {
      if (duration <= 0 || time + duration <= time) {
        finalType = 'tap';
        finalDuration = 0;
      } else if (duration < MIN_LONG_NOTE_DURATION) {
        finalType = 'tap';
        finalDuration = 0;
      }
    }

    const newNote: Note = {
      id: noteIdRef.current++,
      lane,
      time,
      type: finalType,
      duration: finalType === 'hold' ? finalDuration : 0,
      endTime: finalType === 'hold' ? time + finalDuration : time,
      y: 0,
      hit: false,
    };

    setNotes((prev) => {
      const newNotes = [...prev, newNote];
      saveToHistory?.(newNotes);
      return newNotes;
    });
  }, [saveToHistory]);

  // 노트 삭제
  const deleteNote = useCallback((id: number) => {
    if (isMoveMode) return;

    setNotes((prev) => {
      const newNotes = prev.filter((n) => n.id !== id);
      saveToHistory?.(newNotes);
      return newNotes;
    });
  }, [saveToHistory, isMoveMode]);

  // 선택된 노트들 삭제
  const deleteSelectedNotes = useCallback((selectedIds: Set<number>) => {
    if (selectedIds.size === 0 || isMoveMode) return;

    setNotes((prev) => {
      const newNotes = prev.filter((n) => !selectedIds.has(n.id));
      saveToHistory?.(newNotes);
      return newNotes;
    });
  }, [saveToHistory, isMoveMode]);

  // 선대칭 반전
  const mirrorNotes = useCallback((selectedIds: Set<number>) => {
    if (selectedIds.size === 0) return;

    setNotes((prev) => {
      const newNotes = prev.map((note) => {
        if (selectedIds.has(note.id)) {
          // 선대칭 반전: 레인 0↔3, 1↔2
          const mirroredLane = (3 - note.lane) as Lane;
          return { ...note, lane: mirroredLane };
        }
        return note;
      });
      saveToHistory?.(newNotes);
      return newNotes;
    });
  }, [saveToHistory]);

  // 노트 붙여넣기
  const pasteNotes = useCallback((copiedNotes: Note[], currentTime: number) => {
    if (copiedNotes.length === 0) return;

    const newNotes = copiedNotes
      .map((note) => {
        const newTime = note.time + currentTime;
        const isTapNote = (note.duration ?? 0) <= 0 || note.type === 'tap';

        const newEndTime = isTapNote
          ? newTime
          : (note.endTime && note.endTime > note.time
              ? note.endTime + currentTime
              : newTime + (note.duration ?? 0));

        const finalEndTime = newEndTime > newTime ? newEndTime : newTime;
        const finalIsTapNote = isTapNote || finalEndTime <= newTime;

        return {
          ...note,
          id: noteIdRef.current++,
          time: newTime,
          endTime: finalEndTime,
          duration: finalIsTapNote ? 0 : (note.duration ?? 0),
          type: finalIsTapNote ? 'tap' as const : (note.type || 'hold'),
          hit: false,
        };
      })
      .filter((note) => {
        if (note.time < 0 || isNaN(note.time)) return false;
        if (note.endTime < note.time || isNaN(note.endTime)) return false;
        if (note.duration === 0 && note.endTime !== note.time) return false;
        return true;
      });

    if (newNotes.length === 0) return;

    setNotes((prev) => {
      const mergedNotes = [...prev, ...newNotes].sort((a, b) => a.time - b.time);
      saveToHistory?.(mergedNotes);
      return mergedNotes;
    });
  }, [saveToHistory]);

  // 노트 이동 적용
  const applyMove = useCallback((
    selectedIds: Set<number>,
    offset: { time: number; lane: number },
    snapToGrid: (time: number) => number
  ) => {
    if (selectedIds.size === 0) return;

    setNotes((prev) => {
      const newNotes = prev.map((note) => {
        if (selectedIds.has(note.id)) {
          const movedTime = Math.max(0, note.time + offset.time);
          const snappedTime = snapToGrid(movedTime);
          const newLane = Math.max(0, Math.min(3, note.lane + offset.lane)) as Lane;
          return {
            ...note,
            time: snappedTime,
            lane: newLane,
            endTime: note.type === 'hold' ? snappedTime + note.duration : snappedTime,
          };
        }
        return note;
      });
      const sortedNotes = newNotes.sort((a, b) => a.time - b.time);
      saveToHistory?.(sortedNotes);
      return sortedNotes;
    });
  }, [saveToHistory]);

  // 노트 ID 리셋
  const resetNoteIdCounter = useCallback((maxId: number) => {
    noteIdRef.current = maxId + 1;
  }, []);

  return {
    notes,
    setNotes,
    addNote,
    deleteNote,
    deleteSelectedNotes,
    mirrorNotes,
    pasteNotes,
    applyMove,
    sortedNotes,
    nextNoteId: noteIdRef.current,
    resetNoteIdCounter,
  };
}
