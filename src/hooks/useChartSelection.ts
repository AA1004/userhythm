import { useState, useCallback, useRef } from 'react';
import { Note, Lane } from '../types/game';

export interface UseChartSelectionReturn {
  /** 선택된 노트 ID 집합 */
  selectedNoteIds: Set<number>;
  /** 시간 범위 선택 (마퀴 시작/끝 시간) */
  selectionRange: { start: number; end: number } | null;
  /** 드래그 오프셋 (이동 중) */
  dragOffset: { time: number; lane: number } | null;
  /** 이동 모드 활성화 여부 */
  isMoveMode: boolean;
  /** 복사된 노트들 */
  copiedNotes: Note[];

  /** 노트 선택 */
  select: (noteIds: number[]) => void;
  /** 노트 선택 추가 */
  addToSelection: (noteIds: number[]) => void;
  /** 노트 선택 토글 */
  toggleSelection: (noteIds: number[]) => void;
  /** 선택 해제 */
  clearSelection: () => void;
  /** 시간 범위 선택 설정 */
  setSelectionRange: (start: number | null, end: number | null) => void;

  /** 이동 시작 */
  startMove: (time: number, lane: Lane | null, noteId?: number) => void;
  /** 이동 업데이트 */
  updateMove: (timeOffset: number, laneOffset: number) => void;
  /** 이동 종료 - 최종 오프셋 반환 */
  endMove: () => { time: number; lane: number } | null;
  /** 이동 취소 */
  cancelMove: () => void;

  /** 노트 복사 (상대 시간으로 변환) */
  copy: (notes: Note[], selectedIds: Set<number>) => void;
  /** 붙여넣기용 노트 가져오기 */
  getCopiedNotes: () => Note[];

  /** 이동 모드 설정 */
  setMoveMode: (enabled: boolean) => void;

  /** 마퀴 선택 상태 */
  isSelecting: boolean;
  setIsSelecting: (value: boolean) => void;
  marqueeInitialSelectedIds: Set<number>;
  setMarqueeInitialSelectedIds: (ids: Set<number>) => void;
  marqueeOperation: 'replace' | 'add' | 'toggle';
  setMarqueeOperation: (op: 'replace' | 'add' | 'toggle') => void;
}

/**
 * 채보 에디터의 노트 선택 및 이동을 관리하는 훅
 */
export function useChartSelection(): UseChartSelectionReturn {
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(new Set());
  const [selectionStartTime, setSelectionStartTime] = useState<number | null>(null);
  const [selectionEndTime, setSelectionEndTime] = useState<number | null>(null);
  const [copiedNotes, setCopiedNotes] = useState<Note[]>([]);
  const [dragOffset, setDragOffset] = useState<{ time: number; lane: number } | null>(null);
  const [isMoveMode, setIsMoveMode] = useState<boolean>(false);

  // 마퀴 선택 상태
  const [isSelecting, setIsSelecting] = useState(false);
  const [marqueeInitialSelectedIds, setMarqueeInitialSelectedIds] = useState<Set<number>>(new Set());
  const [marqueeOperation, setMarqueeOperation] = useState<'replace' | 'add' | 'toggle'>('replace');

  const dragStartRef = useRef<{ time: number; lane: number } | null>(null);

  // 노트 선택 (교체)
  const select = useCallback((noteIds: number[]) => {
    setSelectedNoteIds(new Set(noteIds));
  }, []);

  // 선택에 추가
  const addToSelection = useCallback((noteIds: number[]) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      noteIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  // 선택 토글
  const toggleSelection = useCallback((noteIds: number[]) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      noteIds.forEach((id) => {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  }, []);

  // 선택 해제
  const clearSelection = useCallback(() => {
    setSelectionStartTime(null);
    setSelectionEndTime(null);
    // 이동 모드가 활성화되어 있으면 선택된 노트 ID는 유지
    if (!isMoveMode) {
      setSelectedNoteIds(new Set());
    }
    setIsSelecting(false);
  }, [isMoveMode]);

  // 시간 범위 선택 설정
  const setSelectionRange = useCallback((start: number | null, end: number | null) => {
    setSelectionStartTime(start);
    setSelectionEndTime(end);
  }, []);

  // 이동 시작
  const startMove = useCallback((time: number, lane: Lane | null, noteId?: number) => {
    dragStartRef.current = { time, lane: lane ?? 0 };
    setDragOffset({ time: 0, lane: 0 });

    // 선택된 노트가 없고 클릭한 노트가 있으면 클릭 노트만 선택
    if (selectedNoteIds.size === 0 && noteId !== undefined) {
      setSelectedNoteIds(new Set([noteId]));
    }
  }, [selectedNoteIds]);

  // 이동 업데이트
  const updateMove = useCallback((timeOffset: number, laneOffset: number) => {
    setDragOffset({ time: timeOffset, lane: laneOffset });
  }, []);

  // 이동 종료 - 최종 오프셋 반환
  const endMove = useCallback((): { time: number; lane: number } | null => {
    const offset = dragOffset;
    setDragOffset(null);
    dragStartRef.current = null;
    return offset;
  }, [dragOffset]);

  // 이동 취소
  const cancelMove = useCallback(() => {
    setDragOffset(null);
    dragStartRef.current = null;
  }, []);

  // 노트 복사 (상대 시간으로 변환)
  const copy = useCallback((notes: Note[], selectedIds: Set<number>) => {
    const selectedNotes = notes.filter((note) => selectedIds.has(note.id));

    if (selectedNotes.length === 0) {
      return;
    }

    // 노트들의 시간을 상대 시간으로 변환 (첫 노트 시간을 0으로)
    const minTime = Math.min(...selectedNotes.map((n) => n.time));
    const copiedNotesWithRelativeTime = selectedNotes.map((note) => {
      const relativeTime = note.time - minTime;
      const isTapNote = (note.duration ?? 0) <= 0 || note.type === 'tap';

      // 탭 노트는 항상 endTime === time, 롱노트는 endTime도 상대 시간으로 변환
      const relativeEndTime = isTapNote
        ? relativeTime
        : (note.endTime && note.endTime > note.time
            ? note.endTime - minTime
            : relativeTime + (note.duration ?? 0));

      return {
        ...note,
        time: relativeTime,
        endTime: relativeEndTime,
        // 탭 노트는 duration을 0으로 강제
        duration: isTapNote ? 0 : (note.duration ?? 0),
        type: isTapNote ? 'tap' as const : (note.type || 'hold'),
      };
    });

    setCopiedNotes(copiedNotesWithRelativeTime);
  }, []);

  // 복사된 노트 가져오기
  const getCopiedNotes = useCallback(() => {
    return copiedNotes;
  }, [copiedNotes]);

  // selectionRange 계산
  const selectionRange = selectionStartTime !== null && selectionEndTime !== null
    ? { start: selectionStartTime, end: selectionEndTime }
    : null;

  return {
    selectedNoteIds,
    selectionRange,
    dragOffset,
    isMoveMode,
    copiedNotes,

    select,
    addToSelection,
    toggleSelection,
    clearSelection,
    setSelectionRange,

    startMove,
    updateMove,
    endMove,
    cancelMove,

    copy,
    getCopiedNotes,

    setMoveMode: setIsMoveMode,

    isSelecting,
    setIsSelecting,
    marqueeInitialSelectedIds,
    setMarqueeInitialSelectedIds: (ids: Set<number>) => setMarqueeInitialSelectedIds(ids),
    marqueeOperation,
    setMarqueeOperation,
  };
}
