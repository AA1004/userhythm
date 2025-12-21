import { useState, useCallback, useRef, useMemo } from 'react';
import { Note, Lane } from '../types/game';
import { useChartHistory } from './useChartHistory';
import { MIN_LONG_NOTE_DURATION, validateNotes, getMaxNoteId } from '../utils/noteValidation';

export interface UseChartEditorNotesOptions {
  /** 그리드에 시간을 스냅하는 함수 */
  snapToGrid: (time: number) => number;
}

export interface UseChartEditorNotesReturn {
  // 상태
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  sortedNotes: Note[];

  // 선택 상태
  selectedNoteIds: Set<number>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  isMoveMode: boolean;
  setIsMoveMode: (enabled: boolean) => void;
  dragOffset: { time: number; lane: number } | null;

  // 복사/붙여넣기
  copiedNotes: Note[];

  // 히스토리
  handleUndo: () => void;
  handleRedo: () => void;
  resetHistory: (notes: Note[]) => void;

  // CRUD
  addNote: (lane: Lane, time: number, type?: 'tap' | 'hold', duration?: number) => void;
  deleteNote: (id: number) => void;
  deleteSelectedNotes: () => void;

  // 선택/이동
  handleCopySelection: () => void;
  handlePasteNotes: (currentTime: number) => void;
  handleMoveStart: (time: number, lane: Lane | null, noteId?: number) => void;
  handleMoveUpdate: (timeOffset: number, laneOffset: number) => void;
  handleMoveEnd: () => void;
  handleMirrorNotes: () => void;
  handleClearSelection: () => void;

  // 마퀴 선택
  marqueeInitialSelectedIdsRef: React.MutableRefObject<Set<number>>;
  marqueeOperationRef: React.MutableRefObject<'replace' | 'add' | 'toggle'>;

  // 복원
  restoreNotes: (data: { notes?: Note[] }) => void;

  // 유틸
  noteIdRef: React.MutableRefObject<number>;
}

export function useChartEditorNotes(
  options: UseChartEditorNotesOptions
): UseChartEditorNotesReturn {
  const { snapToGrid } = options;

  // 노트 상태
  const [notes, setNotes] = useState<Note[]>([]);
  const noteIdRef = useRef(0);

  // 선택 상태
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(new Set());
  const [isMoveMode, setIsMoveMode] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ time: number; lane: number } | null>(null);
  const dragStartRef = useRef<{ time: number; lane: number } | null>(null);

  // 복사/붙여넣기
  const [copiedNotes, setCopiedNotes] = useState<Note[]>([]);

  // 마퀴 선택
  const marqueeInitialSelectedIdsRef = useRef<Set<number>>(new Set());
  const marqueeOperationRef = useRef<'replace' | 'add' | 'toggle'>('replace');

  // 히스토리
  const {
    saveToHistory,
    undo: undoHistory,
    redo: redoHistory,
    reset: resetHistoryInternal,
  } = useChartHistory<Note[]>({ maxSize: 50 });

  // 정렬된 노트
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => a.time - b.time);
  }, [notes]);

  // 히스토리 핸들러
  const handleUndo = useCallback(() => {
    const prevState = undoHistory();
    if (prevState) {
      setNotes([...prevState]);
    }
  }, [undoHistory]);

  const handleRedo = useCallback(() => {
    const nextState = redoHistory();
    if (nextState) {
      setNotes([...nextState]);
    }
  }, [redoHistory]);

  const resetHistory = useCallback((notesData: Note[]) => {
    resetHistoryInternal([...notesData]);
  }, [resetHistoryInternal]);

  // 노트 추가
  const addNote = useCallback((
    lane: Lane,
    time: number,
    type: 'tap' | 'hold' = 'tap',
    duration: number = 0
  ) => {
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
      saveToHistory(newNotes);
      return newNotes;
    });
  }, [saveToHistory]);

  // 노트 삭제
  const deleteNote = useCallback((id: number) => {
    if (isMoveMode) return;

    setNotes((prev) => {
      const newNotes = prev.filter((n) => n.id !== id);
      saveToHistory(newNotes);
      return newNotes;
    });
  }, [saveToHistory, isMoveMode]);

  // 선택된 노트 삭제
  const deleteSelectedNotes = useCallback(() => {
    if (selectedNoteIds.size === 0 || isMoveMode) return;

    setNotes((prev) => {
      const newNotes = prev.filter((n) => !selectedNoteIds.has(n.id));
      saveToHistory(newNotes);
      return newNotes;
    });

    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, saveToHistory, isMoveMode]);

  // 복사
  const handleCopySelection = useCallback(() => {
    const selectedNotes = notes.filter((note) => selectedNoteIds.has(note.id));

    if (selectedNotes.length === 0) return;

    const minTime = Math.min(...selectedNotes.map((n) => n.time));
    const copiedNotesWithRelativeTime = selectedNotes.map((note) => {
      const relativeTime = note.time - minTime;
      const isTapNote = (note.duration ?? 0) <= 0 || note.type === 'tap';

      const relativeEndTime = isTapNote
        ? relativeTime
        : (note.endTime && note.endTime > note.time
            ? note.endTime - minTime
            : relativeTime + (note.duration ?? 0));

      return {
        ...note,
        time: relativeTime,
        endTime: relativeEndTime,
        duration: isTapNote ? 0 : (note.duration ?? 0),
        type: isTapNote ? 'tap' as const : (note.type || 'hold'),
      };
    });

    setCopiedNotes(copiedNotesWithRelativeTime);
  }, [notes, selectedNoteIds]);

  // 붙여넣기
  const handlePasteNotes = useCallback((currentTime: number) => {
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
      const newNotesList = [...prev, ...newNotes].sort((a, b) => a.time - b.time);
      saveToHistory(newNotesList);
      return newNotesList;
    });
  }, [copiedNotes, saveToHistory]);

  // 이동 시작
  const handleMoveStart = useCallback((time: number, lane: Lane | null, noteId?: number) => {
    dragStartRef.current = { time, lane: lane ?? 0 };
    setDragOffset({ time: 0, lane: 0 });

    if (selectedNoteIds.size === 0 && noteId !== undefined) {
      setSelectedNoteIds(new Set([noteId]));
    }
  }, [selectedNoteIds]);

  // 이동 업데이트
  const handleMoveUpdate = useCallback((timeOffset: number, laneOffset: number) => {
    setDragOffset({ time: timeOffset, lane: laneOffset });
  }, []);

  // 이동 종료
  const handleMoveEnd = useCallback(() => {
    if (dragOffset && selectedNoteIds.size > 0) {
      const idsToKeep = new Set(selectedNoteIds);
      const currentDragOffset = dragOffset;

      setNotes((prev) => {
        const newNotes = prev.map((note) => {
          if (idsToKeep.has(note.id)) {
            const movedTime = Math.max(0, note.time + currentDragOffset.time);
            const snappedTime = snapToGrid(movedTime);
            const newLane = Math.max(0, Math.min(3, note.lane + currentDragOffset.lane)) as Lane;
            return {
              ...note,
              time: snappedTime,
              lane: newLane,
            };
          }
          return note;
        });
        const sorted = newNotes.sort((a, b) => a.time - b.time);
        saveToHistory(sorted);

        setDragOffset(null);
        dragStartRef.current = null;

        return sorted;
      });
    } else {
      setDragOffset(null);
      dragStartRef.current = null;
    }
  }, [dragOffset, selectedNoteIds, saveToHistory, snapToGrid]);

  // 선대칭 반전
  const handleMirrorNotes = useCallback(() => {
    if (selectedNoteIds.size === 0) {
      alert('반전할 노트를 먼저 선택해주세요.');
      return;
    }

    setNotes((prev) => {
      const newNotes = prev.map((note) => {
        if (selectedNoteIds.has(note.id)) {
          const mirroredLane = (3 - note.lane) as Lane;
          return { ...note, lane: mirroredLane };
        }
        return note;
      });
      const sorted = newNotes.sort((a, b) => a.time - b.time);
      saveToHistory(sorted);
      return sorted;
    });
  }, [selectedNoteIds, saveToHistory]);

  // 선택 해제
  const handleClearSelection = useCallback(() => {
    if (!isMoveMode) {
      setSelectedNoteIds(new Set());
    }
  }, [isMoveMode]);

  // 복원
  const restoreNotes = useCallback((data: { notes?: Note[] }) => {
    if (Array.isArray(data.notes)) {
      const restoredNotes = validateNotes(data.notes);
      setNotes(restoredNotes);
      resetHistoryInternal([...restoredNotes]);
      noteIdRef.current = getMaxNoteId(restoredNotes) + 1;
    }
  }, [resetHistoryInternal]);

  return {
    notes,
    setNotes,
    sortedNotes,
    selectedNoteIds,
    setSelectedNoteIds,
    isMoveMode,
    setIsMoveMode,
    dragOffset,
    copiedNotes,
    handleUndo,
    handleRedo,
    resetHistory,
    addNote,
    deleteNote,
    deleteSelectedNotes,
    handleCopySelection,
    handlePasteNotes,
    handleMoveStart,
    handleMoveUpdate,
    handleMoveEnd,
    handleMirrorNotes,
    handleClearSelection,
    marqueeInitialSelectedIdsRef,
    marqueeOperationRef,
    restoreNotes,
    noteIdRef,
  };
}
