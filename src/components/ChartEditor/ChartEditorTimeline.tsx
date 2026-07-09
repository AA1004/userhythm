import React, { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Note, SpeedChange, BPMChange, BgaVisibilityInterval, Lane, LanePositionInterval } from '../../types/game';
import {
  LANE_POSITIONS,
  LANE_WIDTH,
  TAP_NOTE_HEIGHT,
  TIMELINE_BOTTOM_PADDING,
  PIXELS_PER_SECOND,
} from './constants';
import { timeToMeasure } from '../../utils/bpmUtils';
import { AudioAnalysisData, AudioAnalysisOnset } from '../../types/audioAnalysis';

// 노트가 레인 경계선 안에 딱 맞게 들어가도록 레인 너비에서 약간의 여백만 남김
const NOTE_WIDTH = LANE_WIDTH - 4;
const NOTE_HALF = NOTE_WIDTH / 2;
// 래퍼 전체 너비 (4개 레인 × 100px)
const CONTENT_WIDTH = LANE_WIDTH * 4;
const MARQUEE_DRAG_THRESHOLD_PX = 4;
const BGA_MIN_DURATION_MS = 120;
const PLAYHEAD_HIT_HEIGHT = 28;
const PLAYHEAD_Z_INDEX = 1200;

interface ChartEditorTimelineProps {
  notes: Note[];
  beatsPerMeasure: number;
  beatDuration: number;
  timelineDurationMs: number;
  gridDivision: number;
  timeSignatureOffset: number;
  speedChanges?: SpeedChange[];
  playheadY: number;
  isAutoScrollEnabled: boolean;
  timelineContentHeight: number;
  timelineScrollRef: React.RefObject<HTMLDivElement>;
  timelineContentRef: React.RefObject<HTMLDivElement>;
  zoom: number;
  onTimelineClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onPlayheadMouseDown: (e: React.MouseEvent) => void;
  onNoteClick: (noteId: number) => void;
  timeToY: (timeMs: number) => number;
  getNoteY: (noteTime: number) => number;
  currentTime: number;
  currentTimeRef?: React.MutableRefObject<number>;
  isPlaying?: boolean;
  bpm: number;
  bpmChanges: BPMChange[];
  bgaVisibilityIntervals?: BgaVisibilityInterval[];
  lanePositionIntervals?: LanePositionInterval[];
  isBgaPlacementMode?: boolean;
  // 선택 영역 관련
  isSelectionMode?: boolean;
  selectedLane?: Lane | null;
  isMoveMode?: boolean;
  selectedNoteIds: Set<number>;
  dragOffset?: { time: number; lane: number } | null;
  selectionStartTime?: number | null;
  selectionEndTime?: number | null;
  onSelectionStart?: (timeMs: number, lane: Lane | null) => void;
  onSelectionUpdate?: (timeMs: number) => void;
  onSelectionEnd?: () => void;
  // 마퀴(드래그 박스) 선택 관련
  onMarqueeStart?: (operation: 'replace' | 'add' | 'toggle') => void;
  onMarqueeUpdate?: (selectedIds: Set<number>) => void;
  onMarqueeEnd?: () => void;
  onMoveStart?: (timeMs: number, lane: Lane | null, noteId?: number) => void;
  onMoveUpdate?: (timeOffset: number, laneOffset: number) => void;
  onMoveEnd?: () => void;
  yToTime: (y: number) => number;
  // 롱노트 모드 관련
  pendingLongNote?: { lane: Lane; startTime: number } | null;
  onAddBgaIntervalAt?: (startTimeMs: number) => void;
  onUpdateBgaInterval?: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDeleteBgaInterval?: (id: string) => void;
  onUpdateLanePositionInterval?: (id: string, patch: Partial<LanePositionInterval>) => void;
  audioAnalysis?: AudioAnalysisData | null;
}

const getAnalysisBandColor = (band: AudioAnalysisOnset['band']) => {
  switch (band) {
    case 'sub':
    case 'low':
      return '96,165,250';
    case 'mid':
      return '52,211,153';
    case 'high':
      return '250,204,21';
    case 'wide':
      return '244,114,182';
    default:
      return '148,163,184';
  }
};

// 성능 최적화: 재생선 위치는 useEffect에서 직접 DOM 업데이트하므로 리렌더링 최소화
export const ChartEditorTimeline: React.FC<ChartEditorTimelineProps> = React.memo(({
  notes,
  beatsPerMeasure,
  beatDuration,
  timelineDurationMs,
  gridDivision,
  timeSignatureOffset,
  speedChanges = [],
  playheadY,
  timelineContentHeight,
  timelineScrollRef,
  timelineContentRef,
  zoom: _zoom, // 줌은 타임라인 스케일링에만 사용 (노트 크기는 고정)
  onTimelineClick,
  onPlayheadMouseDown,
  onNoteClick,
  timeToY,
  getNoteY: _getNoteY,
  currentTime,
  currentTimeRef,
  isPlaying = false,
  pendingLongNote,
  bpm,
  bpmChanges,
  bgaVisibilityIntervals = [],
  lanePositionIntervals = [],
  isBgaPlacementMode = false,
  isSelectionMode = false,
  selectedLane: _selectedLane = null,
  isMoveMode = false,
  selectedNoteIds,
  dragOffset = null,
  selectionStartTime: _selectionStartTime,
  selectionEndTime: _selectionEndTime,
  onSelectionStart,
  onSelectionUpdate,
  onSelectionEnd,
  onMarqueeStart,
  onMarqueeUpdate,
  onMarqueeEnd,
  onMoveStart,
  onMoveUpdate,
  onMoveEnd,
  yToTime,
  onAddBgaIntervalAt,
  onUpdateBgaInterval,
  onDeleteBgaInterval,
  onUpdateLanePositionInterval,
  audioAnalysis = null,
}) => {
  // 재생선 ref (리렌더링 없이 직접 DOM 업데이트)
  const playheadRef = useRef<HTMLDivElement>(null);
  const measureLabelRef = useRef<HTMLDivElement>(null);
  const renderHelpersRef = useRef({
    currentTime,
    timeToY,
    bpm,
    bpmChanges,
    beatsPerMeasure,
  });
  const [isBgaResizing, setIsBgaResizing] = useState(false);
  const [isLanePositionResizing, setIsLanePositionResizing] = useState(false);
  const currentMeasureLabel = useMemo(
    () => `${timeToMeasure(currentTime, bpm, bpmChanges, beatsPerMeasure)}마디`,
    [currentTime, bpm, bpmChanges, beatsPerMeasure]
  );

  const syncPlayhead = useCallback((timeMs: number) => {
    const helpers = renderHelpersRef.current;
    const nextPlayheadY = helpers.timeToY(timeMs);

    if (playheadRef.current) {
      playheadRef.current.style.transform = `translate3d(0, ${nextPlayheadY - PLAYHEAD_HIT_HEIGHT / 2}px, 0)`;
    }

    if (measureLabelRef.current) {
      measureLabelRef.current.style.transform = `translate3d(0, ${nextPlayheadY - 6}px, 0)`;
      measureLabelRef.current.textContent = `${timeToMeasure(
        timeMs,
        helpers.bpm,
        helpers.bpmChanges,
        helpers.beatsPerMeasure
      )}마디`;
    }
  }, []);

  useLayoutEffect(() => {
    renderHelpersRef.current = {
      currentTime,
      timeToY,
      bpm,
      bpmChanges,
      beatsPerMeasure,
    };

    if (!isPlaying) {
      syncPlayhead(currentTime);
    }
  }, [currentTime, timeToY, bpm, bpmChanges, beatsPerMeasure, isPlaying, syncPlayhead]);

  // 재생선은 재생 중 currentTimeRef를 직접 읽어 고주사율로 갱신한다.
  // 부모 state는 더 낮은 빈도로 커밋되어도 재생선 시각 움직임은 유지된다.
  useEffect(() => {
    let frameId: number | null = null;

    if (!isPlaying || !currentTimeRef) {
      syncPlayhead(renderHelpersRef.current.currentTime);
      return;
    }

    const render = () => {
      syncPlayhead(currentTimeRef.current);
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [currentTimeRef, isPlaying, syncPlayhead]);

  // 뷰포트 정보 (가시 영역 + 버퍼)
  const [viewTop, setViewTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const viewBottom = viewTop + viewHeight;
  const VIRTUAL_BUFFER = 800; // 위·아래 버퍼(px)

  // 스크롤/리사이즈에 맞춰 뷰포트 값을 갱신
  const updateViewport = useCallback(() => {
    const container = timelineScrollRef.current;
    if (!container) return;
    const nextTop = container.scrollTop;
    const nextHeight = container.clientHeight;
    setViewTop((prev) => (prev === nextTop ? prev : nextTop));
    setViewHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [timelineScrollRef]);

  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateViewport();
      });
    };

    updateViewport();
    container.addEventListener('scroll', handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateViewport());
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [updateViewport, timelineScrollRef]);

  // 그리드 라인 생성
  const gridLines = useMemo(() => {
    const lines: Array<{ y: number; isMeasure: boolean }> = [];
    const safeBeatDuration = Math.max(1, beatDuration);
    const beatsPerSecond = 1000 / safeBeatDuration;
    const totalBeats = (timelineDurationMs / 1000) * beatsPerSecond;

    for (let beat = 0; beat <= totalBeats; beat += 1 / gridDivision) {
      const timeMs = (beat * beatDuration) + timeSignatureOffset;
      if (timeMs < 0 || timeMs > timelineDurationMs) continue;

      const y = timeToY(timeMs);
      const isMeasure = beat % beatsPerMeasure === 0;
      lines.push({ y, isMeasure });
    }

    return lines;
  }, [timelineDurationMs, beatDuration, gridDivision, timeSignatureOffset, beatsPerMeasure, timeToY]);

  const paddedTop = Math.max(0, viewTop - VIRTUAL_BUFFER);
  const paddedBottom = viewBottom + VIRTUAL_BUFFER;

  const visibleGridLines = useMemo(
    () => gridLines.filter((line) => line.y >= paddedTop && line.y <= paddedBottom),
    [gridLines, paddedTop, paddedBottom]
  );

  // 노트 높이는 줌과 무관하게 고정 (타임라인 스케일만 줌에 따라 변함)
  const tapNoteHeight = TAP_NOTE_HEIGHT;

  // 성능 최적화: 가시 영역 노트만 계산 (timeToY 의존성 제거)
  // 1. 시간 범위로 빠르게 필터링 후 계산
  // 2. timeToY 대신 직접 계산하여 currentTime 변경시 재계산 방지
  const visibleNotes = useMemo(() => {
    // 뷰포트의 시간 범위 계산 (Y좌표 → 시간 변환)
    // timeToY 공식: y = timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom
    // 역변환: timeMs = ((timelineContentHeight - TIMELINE_BOTTOM_PADDING - y) / (PIXELS_PER_SECOND * zoom)) * 1000
    const zoom = _zoom;
    const yToTimeLocal = (y: number): number => {
      const relativeY = timelineContentHeight - TIMELINE_BOTTOM_PADDING - y;
      return (relativeY / (PIXELS_PER_SECOND * zoom)) * 1000;
    };
    const timeToYLocal = (timeMs: number): number => {
      return timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
    };

    // 가시 영역의 시간 범위 (버퍼 포함)
    const viewStartTime = yToTimeLocal(paddedBottom);
    const viewEndTime = yToTimeLocal(paddedTop);

    // 시간 범위 내 노트만 필터링 후 계산
    return notes
      .filter((note) => {
        const endTime = note.endTime || note.time + (note.duration || 0);
        return endTime >= viewStartTime && note.time <= viewEndTime;
      })
      .map((note) => {
        // 이동 모드에서 선택된 노트는 오프셋 적용된 시간 사용
        const isSelected = selectedNoteIds.has(note.id);
        const effectiveTime = dragOffset && isSelected ? Math.max(0, note.time + dragOffset.time) : note.time;
        // 레인을 클램핑하지 않고 실제 계산된 값 사용 (찌그러짐 효과를 위해)
        const rawLane = dragOffset && isSelected ? note.lane + dragOffset.lane : note.lane;
        const effectiveLane = Math.max(0, Math.min(3, rawLane)) as Lane;

        // 찌그러짐 효과 계산 (레인 범위를 벗어나면 너비와 위치 조정)
        const isSquishedLeft = rawLane < 0;
        const isSquishedRight = rawLane > 3;
        const squishAmount = isSquishedLeft ? Math.abs(rawLane) : (isSquishedRight ? rawLane - 3 : 0);
        const squishRatio = Math.max(0, 1 - squishAmount); // 0~1 사이의 비율

        // timeToY 대신 로컬 함수 사용 (의존성 제거)
        const noteY = timeToYLocal(effectiveTime);
        const isHold = note.duration > 0 || note.type === 'hold';
        const endTime = isHold ? (note.endTime || note.time + note.duration) : effectiveTime;
        const endY = isHold ? timeToYLocal(endTime) : noteY;
        const topPosition = isHold
          ? Math.min(noteY, endY) - tapNoteHeight / 2
          : noteY - tapNoteHeight / 2;
        const noteHeight = isHold
          ? Math.max(tapNoteHeight, Math.abs(endY - noteY) + tapNoteHeight)
          : tapNoteHeight;

        return {
          note: { ...note, time: effectiveTime, lane: effectiveLane },
          noteY,
          endY,
          isHold,
          topPosition,
          noteHeight,
          bottom: topPosition + noteHeight,
          rawLane, // 실제 계산된 레인 (클램핑 전)
          isSquishedLeft,
          isSquishedRight,
          squishRatio,
        };
      });
  }, [notes, _zoom, timelineContentHeight, paddedTop, paddedBottom, tapNoteHeight, selectedNoteIds, dragOffset]);

  // 마퀴 선택용 preparedNotes (모든 노트 필요)
  // 성능 최적화: timeToY 대신 로컬 함수 사용하여 currentTime 변경시 재계산 방지
  const preparedNotes = useMemo(
    () => {
      const zoom = _zoom;
      const timeToYLocal = (timeMs: number): number => {
        return timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
      };

      return notes.map((note) => {
        const isSelected = selectedNoteIds.has(note.id);
        const effectiveTime = dragOffset && isSelected ? Math.max(0, note.time + dragOffset.time) : note.time;
        const rawLane = dragOffset && isSelected ? note.lane + dragOffset.lane : note.lane;
        const effectiveLane = Math.max(0, Math.min(3, rawLane)) as Lane;

        const noteY = timeToYLocal(effectiveTime);
        const isHold = note.duration > 0 || note.type === 'hold';
        const endTime = isHold ? (note.endTime || note.time + note.duration) : effectiveTime;
        const endY = isHold ? timeToYLocal(endTime) : noteY;
        const topPosition = isHold
          ? Math.min(noteY, endY) - tapNoteHeight / 2
          : noteY - tapNoteHeight / 2;
        const noteHeight = isHold
          ? Math.max(tapNoteHeight, Math.abs(endY - noteY) + tapNoteHeight)
          : tapNoteHeight;

        return {
          note: { ...note, time: effectiveTime, lane: effectiveLane },
          topPosition,
          noteHeight,
        };
      });
    },
    [notes, _zoom, timelineContentHeight, tapNoteHeight, selectedNoteIds, dragOffset]
  );

  // -----------------------------
  // 마퀴(드래그 박스) 선택 상태
  // -----------------------------
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [isTrackingSelection, setIsTrackingSelection] = useState(false);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeOpRef = useRef<'replace' | 'add' | 'toggle'>('replace');

  const normalizeRect = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    return { left, top, width, height };
  }, []);

  const rectIntersects = useCallback(
    (
      a: { left: number; top: number; width: number; height: number },
      b: { left: number; top: number; width: number; height: number }
    ) => {
      const aRight = a.left + a.width;
      const aBottom = a.top + a.height;
      const bRight = b.left + b.width;
      const bBottom = b.top + b.height;
      return a.left < bRight && aRight > b.left && a.top < bBottom && aBottom > b.top;
    },
    []
  );

  const computeMarqueeSelectedIds = useCallback(
    (rect: { left: number; top: number; width: number; height: number }) => {
      const ids = new Set<number>();

      // selectionRect는 timelineContentRef 좌표계이므로, 노트 박스도 같은 좌표계로 계산
      for (const n of preparedNotes) {
        const lane = n.note.lane;
        const laneCenter = LANE_POSITIONS[lane];
        const noteLeft = laneCenter - NOTE_HALF;
        const noteTop = n.topPosition;
        const noteBox = {
          left: noteLeft,
          top: noteTop,
          width: NOTE_WIDTH,
          height: n.noteHeight,
        };

        if (rectIntersects(rect, noteBox)) {
          ids.add(n.note.id);
        }
      }

      return ids;
    },
    [preparedNotes, rectIntersects]
  );

  // 성능 최적화: timeToY 의존성 제거 (로컬 함수 사용)
  const visibleSpeedChanges = useMemo(
    () => {
      const zoom = _zoom;
      const timeToYLocal = (timeMs: number): number => {
        return timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
      };
      return speedChanges
        .map((sc) => ({ sc, y: timeToYLocal(sc.startTimeMs) }))
        .filter(({ y }) => y >= paddedTop && y <= paddedBottom);
    },
    [speedChanges, _zoom, timelineContentHeight, paddedTop, paddedBottom]
  );

  // 성능 최적화: timeToY 의존성 제거 (로컬 함수 사용)
  const visibleBgaSegments = useMemo(
    () => {
      const zoom = _zoom;
      const timeToYLocal = (timeMs: number): number => {
        return timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
      };
      return bgaVisibilityIntervals
        .map((segment) => {
          const startTime = Math.max(0, Math.min(timelineDurationMs, segment.startTimeMs));
          const endTime = Math.max(startTime, Math.min(timelineDurationMs, segment.endTimeMs));
          const top = Math.min(timeToYLocal(startTime), timeToYLocal(endTime));
          const height = Math.max(28, Math.abs(timeToYLocal(endTime) - timeToYLocal(startTime)));
          return { segment, top, height };
        })
        .filter(({ top, height }) => {
          const bottom = top + height;
          return bottom >= paddedTop && top <= paddedBottom;
        });
    },
    [bgaVisibilityIntervals, timelineDurationMs, _zoom, timelineContentHeight, paddedTop, paddedBottom]
  );

  const visibleLanePositionSegments = useMemo(
    () => {
      const zoom = _zoom;
      const timeToYLocal = (timeMs: number): number => {
        return timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
      };
      return lanePositionIntervals
        .map((segment) => {
          const startTime = Math.max(0, Math.min(timelineDurationMs, segment.startTimeMs));
          const endTime = Math.max(startTime, Math.min(timelineDurationMs, segment.endTimeMs));
          const top = Math.min(timeToYLocal(startTime), timeToYLocal(endTime));
          const height = Math.max(8, Math.abs(timeToYLocal(endTime) - timeToYLocal(startTime)));
          return { segment, top, height };
        })
        .filter(({ top, height }) => {
          const bottom = top + height;
          return bottom >= paddedTop && top <= paddedBottom;
        });
    },
    [lanePositionIntervals, timelineDurationMs, _zoom, timelineContentHeight, paddedTop, paddedBottom]
  );

  const visibleAnalysisMarkers = useMemo(() => {
    if (!audioAnalysis) {
      return { beats: [], onsets: [] };
    }

    const zoom = _zoom;
    const timeToYLocal = (timeMs: number): number => {
      return timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
    };

    const beats = (audioAnalysis.beats ?? [])
      .map((beat, index) => ({
        beat,
        index,
        y: timeToYLocal(Math.max(0, Number(beat.timeMs) || 0)),
      }))
      .filter(({ y }) => y >= paddedTop && y <= paddedBottom);

    const onsets = (audioAnalysis.onsets ?? [])
      .map((onset, index) => ({
        onset,
        index,
        y: timeToYLocal(Math.max(0, Number(onset.timeMs) || 0)),
      }))
      .filter(({ y }) => y >= paddedTop && y <= paddedBottom);

    return { beats, onsets };
  }, [audioAnalysis, _zoom, timelineContentHeight, paddedTop, paddedBottom]);

  // 초기 한 번만 스크롤을 재생선 위치로 설정 (재생선이 화면 중앙에 오도록)
  const didInitScrollRef = useRef(false);
  const lastTimelineHeightRef = useRef<number | null>(null);
  useEffect(() => {
    if (isPlaying) return;
    // 타임라인 높이가 크게 바뀌면 재초기화
    if (
      lastTimelineHeightRef.current !== null &&
      Math.abs(lastTimelineHeightRef.current - timelineContentHeight) > 1
    ) {
      didInitScrollRef.current = false;
    }
    lastTimelineHeightRef.current = timelineContentHeight;

    if (didInitScrollRef.current) return;
    if (!timelineScrollRef.current) return;

    const container = timelineScrollRef.current;
    let frame1: number | null = null;
    let frame2: number | null = null;

    const alignToPlayhead = () => {
      if (!timelineScrollRef.current) return;
      const centerOffset = container.clientHeight / 2;
      const alignedPlayheadY = timeToY(isPlaying && currentTimeRef ? currentTimeRef.current : currentTime);
      const targetScrollTop = Math.max(0, Math.round(alignedPlayheadY - centerOffset));
      container.scrollTop = targetScrollTop;
      // 일정 범위 이내면 초기 정렬 완료로 간주
      if (Math.abs(container.scrollTop - targetScrollTop) <= 1) {
        didInitScrollRef.current = true;
      }
    };

    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(alignToPlayhead);
    });

    return () => {
      if (frame1) cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [timelineContentHeight, playheadY, timeToY, isPlaying, currentTimeRef, currentTime]);

  // 드래그 선택 핸들러
  const isDraggingSelectionRef = useRef(false);
  const isDraggingMoveRef = useRef(false);
  const bgaResizeRef = useRef<{ id: string; edge: 'start' | 'end' } | null>(null);
  const lanePositionResizeRef = useRef<{ id: string; edge: 'start' | 'end' } | null>(null);
  const moveStartRef = useRef<{ time: number; lane: number } | null>(null);
  const suppressNextTimelineClickRef = useRef(false);
  const selectionPointerStartRef = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    op: 'replace' | 'add' | 'toggle';
  } | null>(null);

  const suppressTimelineClick = useCallback(() => {
    suppressNextTimelineClickRef.current = true;
  }, []);

  const startBgaResize = useCallback((
    event: React.MouseEvent<HTMLElement>,
    id: string,
    edge: 'start' | 'end'
  ) => {
    if (!isBgaPlacementMode) return;
    bgaResizeRef.current = { id, edge };
    setIsBgaResizing(true);
    suppressTimelineClick();
    window.getSelection()?.removeAllRanges();
    event.preventDefault();
    event.stopPropagation();
  }, [isBgaPlacementMode, suppressTimelineClick]);

  const startLanePositionResize = useCallback((
    event: React.MouseEvent<HTMLElement>,
    id: string,
    edge: 'start' | 'end'
  ) => {
    if (!onUpdateLanePositionInterval) return;
    lanePositionResizeRef.current = { id, edge };
    setIsLanePositionResizing(true);
    suppressTimelineClick();
    window.getSelection()?.removeAllRanges();
    event.preventDefault();
    event.stopPropagation();
  }, [onUpdateLanePositionInterval, suppressTimelineClick]);

  const isScrollbarInteraction = useCallback((clientX: number, clientY: number) => {
    const scroll = timelineScrollRef.current;
    if (!scroll) return false;

    const rect = scroll.getBoundingClientRect();
    const hasVerticalScrollbar = scroll.scrollHeight > scroll.clientHeight;
    const hasHorizontalScrollbar = scroll.scrollWidth > scroll.clientWidth;
    const isVerticalScrollbar = hasVerticalScrollbar && clientX >= rect.left + scroll.clientWidth;
    const isHorizontalScrollbar = hasHorizontalScrollbar && clientY >= rect.top + scroll.clientHeight;

    return isVerticalScrollbar || isHorizontalScrollbar;
  }, [timelineScrollRef]);

  const preventNativeDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressNextTimelineClickRef.current) {
        suppressNextTimelineClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (isScrollbarInteraction(e.clientX, e.clientY)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (isBgaPlacementMode) {
        if ((e.target as HTMLElement).closest('[data-playhead], [data-bga-segment], [data-bga-control]')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const content = timelineContentRef.current;
        if (!content || !onAddBgaIntervalAt) return;
        const rect = content.getBoundingClientRect();
        const y = e.clientY - rect.top;
        onAddBgaIntervalAt(yToTime(y));
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      onTimelineClick(e);
    },
    [isScrollbarInteraction, isBgaPlacementMode, onAddBgaIntervalAt, onTimelineClick, timelineContentRef, yToTime]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      return;
    }

    if (e.button !== 0) return;

    if (isScrollbarInteraction(e.clientX, e.clientY)) {
      suppressTimelineClick();
      return;
    }

    const target = e.target as HTMLElement;
    const lanePositionHandle = target.closest('[data-lane-position-resize]') as HTMLElement | null;
    if (lanePositionHandle) {
      const id = lanePositionHandle.dataset.lanePositionId;
      const edge = lanePositionHandle.dataset.lanePositionResize as 'start' | 'end' | undefined;
      if (id && edge) {
        lanePositionResizeRef.current = { id, edge };
        setIsLanePositionResizing(true);
        suppressTimelineClick();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    const bgaHandle = isBgaPlacementMode ? (target.closest('[data-bga-resize]') as HTMLElement | null) : null;
    if (bgaHandle) {
      const id = bgaHandle.dataset.bgaId;
      const edge = bgaHandle.dataset.bgaResize as 'start' | 'end' | undefined;
      if (id && edge) {
        bgaResizeRef.current = { id, edge };
        setIsBgaResizing(true);
        suppressTimelineClick();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    if (isBgaPlacementMode && target.closest('[data-bga-control], [data-bga-segment]')) {
      suppressTimelineClick();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (isBgaPlacementMode) {
      return;
    }

    // 이동 모드이고 노트를 클릭했으면 이동 드래그 시작
    if (isMoveMode) {
      // 노트를 클릭했는지 확인
      const clickedNote = (e.target as HTMLElement).closest('[data-note]');
      if (clickedNote) {
        const noteId = parseInt(clickedNote.getAttribute('data-note-id') || '0');
        // 선택된 노트가 있으면 선택된 노트만 이동, 없으면 클릭한 노트만 이동
        const shouldMove = selectedNoteIds.size > 0 
          ? selectedNoteIds.has(noteId)
          : true; // 선택된 노트가 없으면 클릭한 노트를 선택하고 이동
        
        if (shouldMove) {
          if (!timelineContentRef.current) return;
          const rect = timelineContentRef.current.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const x = e.clientX - rect.left;
          const time = yToTime(y);
          
          // X 좌표로 레인 감지 (x는 이미 rect 기준 상대 좌표)
          let detectedLane: Lane | null = null;
          for (let i = 0; i < LANE_POSITIONS.length; i++) {
            const laneCenter = LANE_POSITIONS[i];
            const laneLeft = laneCenter - LANE_WIDTH / 2;
            const laneRight = laneCenter + LANE_WIDTH / 2;
            if (x >= laneLeft && x < laneRight) {
              detectedLane = i as Lane;
              break;
            }
          }
          
          isDraggingMoveRef.current = true;
          moveStartRef.current = { time, lane: detectedLane ?? 0 };
          if (onMoveStart) {
            // 선택된 노트가 없으면 클릭한 노트 ID를 전달하여 선택
            const noteIdToSelect = selectedNoteIds.size === 0 ? noteId : undefined;
            onMoveStart(time, detectedLane, noteIdToSelect);
          }
          suppressTimelineClick();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }
    
    // 선택 모드가 꺼져있으면 드래그 선택 비활성화
    if (!isSelectionMode) return;
    
    // 재생선이나 노트 클릭이면 선택 모드 비활성화
    if ((e.target as HTMLElement).closest('[data-playhead]') || 
        (e.target as HTMLElement).closest('[data-note]')) {
      return;
    }
    
    if (!timelineContentRef.current) return;
    const rect = timelineContentRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // modifier는 mousedown 시점으로 고정
    const op: 'replace' | 'add' | 'toggle' =
      e.ctrlKey ? 'toggle' : e.shiftKey ? 'add' : 'replace';
    marqueeOpRef.current = op;

    selectionPointerStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      x,
      y,
      op,
    };
    marqueeStartRef.current = { x, y };
    setIsTrackingSelection(true);
    window.getSelection()?.removeAllRanges();
    e.preventDefault();
  }, [isSelectionMode, isMoveMode, selectedNoteIds, yToTime, onMoveStart, timelineContentRef, suppressTimelineClick, isScrollbarInteraction, isBgaPlacementMode]);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (lanePositionResizeRef.current && onUpdateLanePositionInterval && timelineContentRef.current) {
      const activeResize = lanePositionResizeRef.current;
      const interval = lanePositionIntervals.find((item) => item.id === activeResize.id);
      if (!interval) {
        lanePositionResizeRef.current = null;
        setIsLanePositionResizing(false);
        return;
      }

      const rect = timelineContentRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const currentResizeTime = Math.max(0, yToTime(y));

      if (activeResize.edge === 'start') {
        onUpdateLanePositionInterval(activeResize.id, {
          startTimeMs: Math.min(currentResizeTime, Math.max(0, interval.endTimeMs - BGA_MIN_DURATION_MS)),
        });
      } else {
        onUpdateLanePositionInterval(activeResize.id, {
          endTimeMs: Math.max(interval.startTimeMs + BGA_MIN_DURATION_MS, currentResizeTime),
        });
      }
      e.preventDefault();
      return;
    }

    if (bgaResizeRef.current && onUpdateBgaInterval && timelineContentRef.current) {
      const activeResize = bgaResizeRef.current;
      const interval = bgaVisibilityIntervals.find((item) => item.id === activeResize.id);
      if (!interval) {
        bgaResizeRef.current = null;
        return;
      }

      const rect = timelineContentRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const currentResizeTime = Math.max(0, yToTime(y));

      if (activeResize.edge === 'start') {
        onUpdateBgaInterval(activeResize.id, {
          startTimeMs: Math.min(currentResizeTime, Math.max(0, interval.endTimeMs - BGA_MIN_DURATION_MS)),
        });
      } else {
        onUpdateBgaInterval(activeResize.id, {
          endTimeMs: Math.max(interval.startTimeMs + BGA_MIN_DURATION_MS, currentResizeTime),
        });
      }
      e.preventDefault();
      return;
    }

    // 이동 모드 드래그 처리
    if (isDraggingMoveRef.current && onMoveUpdate && moveStartRef.current) {
      if (!timelineContentRef.current) return;
      const rect = timelineContentRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const x = e.clientX - rect.left;
      const currentTime = yToTime(y);
      
      // X 좌표로 레인 감지 (x는 이미 rect 기준 상대 좌표)
      let detectedLane: number = 0;
      for (let i = 0; i < LANE_POSITIONS.length; i++) {
        const laneCenter = LANE_POSITIONS[i];
        const laneLeft = laneCenter - LANE_WIDTH / 2;
        const laneRight = laneCenter + LANE_WIDTH / 2;
        if (x >= laneLeft && x < laneRight) {
          detectedLane = i;
          break;
        }
      }
      
      const timeOffset = currentTime - moveStartRef.current.time;
      const laneOffset = detectedLane - moveStartRef.current.lane;
      
      onMoveUpdate(timeOffset, laneOffset);
      return;
    }
    
    if (isTrackingSelection && !isDraggingSelectionRef.current) {
      const start = selectionPointerStartRef.current;
      if (!start || !timelineContentRef.current) return;

      const deltaX = e.clientX - start.clientX;
      const deltaY = e.clientY - start.clientY;
      if (Math.hypot(deltaX, deltaY) < MARQUEE_DRAG_THRESHOLD_PX) {
        return;
      }

      const rect = timelineContentRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const x = e.clientX - rect.left;
      const normalized = normalizeRect(start.x, start.y, x, y);

      isDraggingSelectionRef.current = true;
      marqueeOpRef.current = start.op;
      setMarqueeRect(normalized);

      if (onMarqueeStart) onMarqueeStart(start.op);
      if (onMarqueeUpdate) onMarqueeUpdate(computeMarqueeSelectedIds(normalized));
      if (onSelectionStart) onSelectionStart(yToTime(start.y), null);
      if (onSelectionUpdate) onSelectionUpdate(yToTime(y));

      suppressTimelineClick();
      window.getSelection()?.removeAllRanges();
      e.preventDefault();
      return;
    }

    // 선택 모드 드래그 처리 (마퀴 선택은 onSelectionUpdate 없이도 동작)
    if (!isDraggingSelectionRef.current) return;
    if (!timelineContentRef.current) return;
    
    const rect = timelineContentRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;

    const start = marqueeStartRef.current;
    if (start) {
      const normalized = normalizeRect(start.x, start.y, x, y);
      setMarqueeRect(normalized);
      if (onMarqueeUpdate) onMarqueeUpdate(computeMarqueeSelectedIds(normalized));
    }

    if (onSelectionUpdate) onSelectionUpdate(yToTime(y));
    e.preventDefault();
  }, [isTrackingSelection, yToTime, onSelectionStart, onSelectionUpdate, onMoveUpdate, timelineContentRef, normalizeRect, onMarqueeStart, onMarqueeUpdate, computeMarqueeSelectedIds, suppressTimelineClick, onUpdateBgaInterval, bgaVisibilityIntervals, onUpdateLanePositionInterval, lanePositionIntervals]);
  
  const handleMouseUp = useCallback(() => {
    if (lanePositionResizeRef.current) {
      lanePositionResizeRef.current = null;
    }
    setIsLanePositionResizing(false);
    if (bgaResizeRef.current) {
      bgaResizeRef.current = null;
    }
    setIsBgaResizing(false);
    if (isDraggingMoveRef.current) {
      if (onMoveEnd) {
        onMoveEnd();
      }
      isDraggingMoveRef.current = false;
      moveStartRef.current = null;
    }
    if (isDraggingSelectionRef.current) {
      // 드래그가 끝나기 전에 최종 선택 상태를 확정
      // marqueeRect가 null이 되기 전에 마지막 선택 상태를 전달
      const finalRect = marqueeRect;
      if (finalRect && onMarqueeUpdate) {
        onMarqueeUpdate(computeMarqueeSelectedIds(finalRect));
      }
      if (onSelectionEnd) {
        onSelectionEnd();
      }
      if (onMarqueeEnd) onMarqueeEnd();
    }
    isDraggingSelectionRef.current = false;
    selectionPointerStartRef.current = null;
    marqueeStartRef.current = null;
    setIsTrackingSelection(false);
    setMarqueeRect(null);
  }, [onSelectionEnd, onMoveEnd, onMarqueeUpdate, onMarqueeEnd, marqueeRect, computeMarqueeSelectedIds]);
  
  useEffect(() => {
    if (isTrackingSelection || isDraggingSelectionRef.current || isDraggingMoveRef.current || isBgaResizing || isLanePositionResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isTrackingSelection, isBgaResizing, isLanePositionResizing, handleMouseMove, handleMouseUp]);

  // 기존 세로 선택(selectionBox)은 마퀴 선택으로 대체됨

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
        }
      `}</style>
      <div
        ref={timelineScrollRef}
        onClick={handleTimelineClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDragStart={preventNativeDrag}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'auto',
          position: 'relative',
          background:
            'radial-gradient(circle at top, rgba(15,23,42,0.9), rgba(15,23,42,1))',
          userSelect: 'none',
        }}
      >
      {/* 타임라인 컨텐츠 */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${timelineContentHeight}px`,
          minHeight: '100%',
        }}
      >
        {/* 중앙 정렬된 컨텐츠 래퍼 */}
        <div
          ref={timelineContentRef}
          draggable={false}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${CONTENT_WIDTH}px`,
            height: '100%',
            userSelect: 'none',
        }}
      >
        {/* 마퀴(드래그 박스) 선택 오버레이 */}
        {isSelectionMode && marqueeRect && (
          <div
            style={{
              position: 'absolute',
              left: `${marqueeRect.left}px`,
              top: `${marqueeRect.top}px`,
              width: `${marqueeRect.width}px`,
              height: `${marqueeRect.height}px`,
              border: '2px solid rgba(96, 165, 250, 0.95)',
              backgroundColor: 'rgba(96, 165, 250, 0.18)',
              boxShadow: '0 0 12px rgba(96, 165, 250, 0.25)',
              borderRadius: '6px',
              pointerEvents: 'none',
              zIndex: 900,
            }}
          />
        )}
         {/* 레인 배경 */}
         {LANE_POSITIONS.map((x, index) => (
           <div
             key={index}
             style={{
               position: 'absolute',
               left: `${x - LANE_WIDTH / 2}px`,
               top: 0,
               width: `${LANE_WIDTH}px`,
               height: '100%',
               background:
                 index % 2 === 0
                   ? 'linear-gradient(180deg, #020617 0%, #020617 40%, #020617 100%)'
                   : 'linear-gradient(180deg, #0a0f1a 0%, #0a0f1a 40%, #0a0f1a 100%)',
               boxShadow: 'inset 1px 0 0 rgba(15,23,42,0.9), inset -1px 0 0 rgba(15,23,42,0.9)',
             }}
           />
         ))}

        {/* 레인 경계선 (5개: 0, 100, 200, 300, 400) */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={`divider-${i}`}
            style={{
              position: 'absolute',
              left: `${i * LANE_WIDTH}px`,
              top: 0,
              width: '1px',
              height: '100%',
              backgroundColor: 'rgba(148, 163, 184, 0.35)',
            }}
          />
        ))}

        {/* 그리드 라인 */}
        {visibleGridLines.map((line, index) => (
          <div
            key={`grid-${index}`}
            style={{
              position: 'absolute',
              left: 0,
              top: `${line.y}px`,
              width: `${CONTENT_WIDTH}px`,
              height: '1px',
              backgroundColor: line.isMeasure
                ? 'rgba(56, 189, 248, 0.55)'
                : 'rgba(148, 163, 184, 0.25)',
            }}
          />
        ))}

        {/* 로컬 오디오 분석 마커 */}
        {visibleAnalysisMarkers.beats.map(({ beat, index, y }) => {
          const isDownbeat = beat.beatInMeasure === 1;
          return (
            <div
              key={`analysis-beat-${index}`}
              style={{
                position: 'absolute',
                left: 0,
                top: `${y}px`,
                width: `${CONTENT_WIDTH}px`,
                height: isDownbeat ? 2 : 1,
                background: isDownbeat
                  ? 'linear-gradient(90deg, rgba(34,211,238,0), rgba(34,211,238,0.72), rgba(34,211,238,0))'
                  : 'rgba(34,211,238,0.28)',
                boxShadow: isDownbeat ? '0 0 10px rgba(34,211,238,0.3)' : undefined,
                pointerEvents: 'none',
                zIndex: 4,
              }}
              title={`분석 beat ${Math.round(beat.timeMs)}ms`}
            />
          );
        })}

        {visibleAnalysisMarkers.onsets.map(({ onset, index, y }) => {
          const strength = Math.max(0.08, Math.min(1, Number(onset.strength) || 0.35));
          const color = getAnalysisBandColor(onset.band);
          return (
            <div
              key={`analysis-onset-${index}`}
              style={{
                position: 'absolute',
                left: 0,
                top: `${y - 1}px`,
                width: `${CONTENT_WIDTH}px`,
                height: `${Math.max(2, Math.round(2 + strength * 5))}px`,
                background: `linear-gradient(90deg, rgba(${color},0.08), rgba(${color},${0.32 + strength * 0.46}), rgba(${color},0.08))`,
                boxShadow: `0 0 ${Math.round(4 + strength * 12)}px rgba(${color},${0.18 + strength * 0.3})`,
                opacity: 0.72,
                pointerEvents: 'none',
                zIndex: 5,
              }}
              title={`분석 onset ${Math.round(onset.timeMs)}ms · ${onset.band ?? 'unknown'} · ${strength.toFixed(2)}`}
            />
          );
        })}

        {/* 변속 마커 (SpeedChange) */}
        {visibleSpeedChanges.map(({ sc, y }) => (
          <div
            key={`speed-start-${sc.id}`}
            style={{
              position: 'absolute',
              left: 0,
              top: `${y}px`,
              width: `${CONTENT_WIDTH}px`,
              height: 2,
              background:
                'linear-gradient(90deg, rgba(56,189,248,0.1), rgba(56,189,248,0.9), rgba(56,189,248,0.1))',
              boxShadow: '0 0 10px rgba(56,189,248,0.6)',
            }}
            title={`Speed BPM ${sc.bpm}`}
          />
        ))}

        {/* 레인 위치 이동 구간: 노트 레인이 아니라 왼쪽 얇은 보조 트랙에 표시 */}
        {visibleLanePositionSegments.map(({ segment, top, height }) => {
          const tone =
            segment.offsetX < 0
              ? '34,211,238'
              : segment.offsetX > 0
                ? '168,85,247'
                : '148,163,184';
          const label = segment.offsetX < 0 ? 'L' : segment.offsetX > 0 ? 'R' : 'C';
          return (
            <div
              key={segment.id}
              data-lane-position-segment="true"
              style={{
                position: 'absolute',
                left: -18,
                top: `${top}px`,
                width: 12,
                height: `${height}px`,
                borderRadius: 999,
                background: `rgba(${tone}, 0.42)`,
                border: `1px solid rgba(${tone}, 0.9)`,
                boxShadow: `0 0 10px rgba(${tone}, 0.35)`,
                zIndex: 7,
                pointerEvents: onUpdateLanePositionInterval ? 'auto' : 'none',
              }}
              title={`레인 위치 ${label} (${Math.round(segment.startTimeMs)}ms ~ ${Math.round(segment.endTimeMs)}ms)`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {onUpdateLanePositionInterval && (
                <>
                  <button
                    type="button"
                    data-lane-position-resize="end"
                    data-lane-position-id={segment.id}
                    onMouseDown={(e) => startLanePositionResize(e, segment.id, 'end')}
                    style={{
                      position: 'absolute',
                      top: -7,
                      left: -5,
                      width: 22,
                      height: 18,
                      border: 'none',
                      borderRadius: 999,
                      background: 'transparent',
                      cursor: 'ns-resize',
                      padding: 0,
                    }}
                    aria-label="Lane position end resize"
                  />
                  <button
                    type="button"
                    data-lane-position-resize="start"
                    data-lane-position-id={segment.id}
                    onMouseDown={(e) => startLanePositionResize(e, segment.id, 'start')}
                    style={{
                      position: 'absolute',
                      bottom: -7,
                      left: -5,
                      width: 22,
                      height: 18,
                      border: 'none',
                      borderRadius: 999,
                      background: 'transparent',
                      cursor: 'ns-resize',
                      padding: 0,
                    }}
                    aria-label="Lane position start resize"
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: -1,
                      left: -2,
                      width: 14,
                      height: 3,
                      borderRadius: 999,
                      background: `rgba(${tone}, 0.95)`,
                      boxShadow: `0 0 7px rgba(${tone}, 0.55)`,
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      left: -2,
                      width: 14,
                      height: 3,
                      borderRadius: 999,
                      background: `rgba(${tone}, 0.95)`,
                      boxShadow: `0 0 7px rgba(${tone}, 0.55)`,
                      pointerEvents: 'none',
                    }}
                  />
                </>
              )}
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 0,
                  width: '100%',
                  textAlign: 'center',
                  fontSize: 8,
                  fontWeight: 900,
                  color: '#f8fafc',
                  textShadow: '0 0 4px rgba(0,0,0,0.8)',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}


        {/* 간주 구간 오버레이 (채보 레인 숨김) */}
        {visibleBgaSegments.map(({ segment, top, height }) => {
          const total = Math.max(1, segment.endTimeMs - segment.startTimeMs);
          const fadeInRatio = Math.min(1, Math.max(0, (segment.fadeInMs ?? 0) / total));
          const fadeOutRatio = Math.min(1, Math.max(0, (segment.fadeOutMs ?? 0) / total));
          const midStart = fadeInRatio;
          const midEnd = Math.max(midStart, 1 - fadeOutRatio);
          const baseColor = 'rgba(248,113,113,0.22)';
          const gradientStops = [
            fadeInRatio > 0 ? 'rgba(0,0,0,0) 0%' : `${baseColor} 0%`,
            ...(fadeInRatio > 0 ? [`${baseColor} ${midStart * 100}%`] : []),
            `${baseColor} ${midEnd * 100}%`,
            fadeOutRatio > 0 ? 'rgba(0,0,0,0) 100%' : `${baseColor} 100%`,
          ];
          const gradient = `linear-gradient(to bottom, ${gradientStops.join(', ')})`;

          return (
            <div
              key={segment.id}
              data-bga-segment="true"
              style={{
                position: 'absolute',
                left: 0,
                top: `${top}px`,
                width: `${CONTENT_WIDTH}px`,
                height: `${height}px`,
                background: gradient,
                border: '1px dashed rgba(239,68,68,0.6)',
                borderRadius: 6,
                boxShadow: '0 0 12px rgba(248,113,113,0.35)',
                pointerEvents: isBgaPlacementMode ? 'auto' : 'none',
                zIndex: 6,
              }}
              title={`레인 페이드 구간 (${segment.startTimeMs}ms ~ ${segment.endTimeMs}ms)`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {isBgaPlacementMode && (
                <>
                  <button
                    type="button"
                    data-bga-resize="end"
                    data-bga-id={segment.id}
                    onMouseDown={(e) => startBgaResize(e, segment.id, 'end')}
                    style={{
                      position: 'absolute',
                      top: -8,
                      left: 0,
                      width: '100%',
                      height: 24,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'ns-resize',
                    }}
                    aria-label="BGA fade end resize"
                  />
                  <button
                    type="button"
                    data-bga-resize="start"
                    data-bga-id={segment.id}
                    onMouseDown={(e) => startBgaResize(e, segment.id, 'start')}
                    style={{
                      position: 'absolute',
                      bottom: -8,
                      left: 0,
                      width: '100%',
                      height: 24,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'ns-resize',
                    }}
                    aria-label="BGA fade start resize"
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: 12,
                      borderTop: '2px solid rgba(254,202,202,0.72)',
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      width: '100%',
                      height: 12,
                      borderBottom: '2px solid rgba(254,202,202,0.72)',
                      pointerEvents: 'none',
                    }}
                  />
                </>
              )}
              <span
                style={{
                  position: 'absolute',
                  right: 6,
                  top: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fca5a5',
                  textShadow: '0 0 6px rgba(0,0,0,0.65)',
                  pointerEvents: 'none',
                }}
              >
                FADE
              </span>
              {isBgaPlacementMode && (
                <div
                  data-bga-control="true"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 10,
                    background: 'rgba(2,6,23,0.82)',
                    border: '1px solid rgba(248,113,113,0.35)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#fecaca' }}>
                    IN
                    <input
                      data-bga-control="true"
                      type="number"
                      min={0}
                      value={Math.round(segment.fadeInMs ?? 0)}
                      onChange={(e) => onUpdateBgaInterval?.(segment.id, { fadeInMs: Math.max(0, Number(e.target.value) || 0) })}
                      style={{
                        width: 52,
                        padding: '2px 4px',
                        borderRadius: 6,
                        border: '1px solid rgba(248,113,113,0.3)',
                        background: 'rgba(15,23,42,0.9)',
                        color: '#fff',
                        fontSize: 10,
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#fecaca' }}>
                    OUT
                    <input
                      data-bga-control="true"
                      type="number"
                      min={0}
                      value={Math.round(segment.fadeOutMs ?? 0)}
                      onChange={(e) => onUpdateBgaInterval?.(segment.id, { fadeOutMs: Math.max(0, Number(e.target.value) || 0) })}
                      style={{
                        width: 52,
                        padding: '2px 4px',
                        borderRadius: 6,
                        border: '1px solid rgba(248,113,113,0.3)',
                        background: 'rgba(15,23,42,0.9)',
                        color: '#fff',
                        fontSize: 10,
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    data-bga-control="true"
                    onClick={() => onDeleteBgaInterval?.(segment.id)}
                    style={{
                      padding: '3px 7px',
                      borderRadius: 6,
                      border: '1px solid rgba(248,113,113,0.5)',
                      background: 'rgba(127,29,29,0.9)',
                      color: '#fecaca',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* 롱노트 시작점 마커 */}
        {pendingLongNote && (() => {
          const startY = timeToY(pendingLongNote.startTime);
          const laneCenter = LANE_POSITIONS[pendingLongNote.lane];
          return (
            <div
              key="pending-long-note-marker"
              style={{
                position: 'absolute',
                left: `${laneCenter - 8}px`,
                top: `${startY - 8}px`,
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                border: '2px solid #ffffff',
                boxShadow: '0 0 12px rgba(56, 189, 248, 0.8), 0 0 24px rgba(56, 189, 248, 0.4)',
                zIndex: 20,
                pointerEvents: 'none',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          );
        })()}

        {/* 판정선 (타임라인 하단에 고정) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: `${timelineContentHeight - TIMELINE_BOTTOM_PADDING}px`,
            width: `${CONTENT_WIDTH}px`,
            height: '3px',
            background:
              'linear-gradient(90deg, rgba(244, 244, 245, 0) 0%, #facc15 20%, #f97316 80%, rgba(244, 244, 245, 0) 100%)',
            boxShadow: '0 0 16px rgba(250, 204, 21, 0.55)',
          }}
        />

         {/* 노트 렌더링 */}
          {visibleNotes.map(({ note, isHold, topPosition, noteHeight, isSquishedLeft, isSquishedRight, squishRatio }) => {
           const isOddLane = note.lane === 0 || note.lane === 2;
           const tapGradient = isOddLane
             ? 'linear-gradient(180deg, #FF6B6B 0%, #FF9A8B 100%)'
             : 'linear-gradient(180deg, #4ECDC4 0%, #4AC8E7 100%)';
           const tapBorder = isOddLane ? '#EE5A52' : '#45B7B8';
           const holdGradient = isOddLane
             ? 'linear-gradient(180deg, rgba(255,231,157,0.95) 0%, rgba(255,193,7,0.65) 100%)'
             : 'linear-gradient(180deg, rgba(78,205,196,0.9) 0%, rgba(32,164,154,0.7) 100%)';
           
           // 이동 모드에서 선택된 노트인지 확인
           const isSelected = selectedNoteIds.has(note.id);
           
           // 찌그러짐 효과 적용: 레인 범위를 벗어나면 위치와 너비 조정
           // 클릭 영역은 항상 원래 레인 위치에 유지 (이동 가능하도록)
           const baseLeft = LANE_POSITIONS[note.lane] - NOTE_HALF;
           const displayLeft = baseLeft; // 클릭 영역은 항상 원래 위치
           const displayWidth = NOTE_WIDTH; // 클릭 영역은 항상 원래 크기
           
           // 시각적 표현만 찌그러짐 효과 적용
           let visualLeft = baseLeft;
           let visualWidth = NOTE_WIDTH;
           
           if (isSquishedLeft) {
             // 왼쪽으로 벗어남: 왼쪽 경계에 맞추고 너비 축소
             visualLeft = -NOTE_HALF;
             visualWidth = NOTE_WIDTH * squishRatio;
           } else if (isSquishedRight) {
             // 오른쪽으로 벗어남: 오른쪽 경계에 맞추고 너비 축소
             visualLeft = LANE_POSITIONS[3] + NOTE_HALF - (NOTE_WIDTH * squishRatio);
             visualWidth = NOTE_WIDTH * squishRatio;
           }
           
           // 선택된 노트는 반투명하게 표시 (드래그 중일 때)
           const opacity = isSelected && dragOffset ? 0.6 : 1;

           return (
             <div
               key={note.id}
               data-note
               data-note-id={note.id}
               draggable={false}
               onDragStart={preventNativeDrag}
               onClick={(e) => {
                 e.stopPropagation();
                 if (isBgaPlacementMode) {
                   const content = timelineContentRef.current;
                   if (content && onAddBgaIntervalAt) {
                     const rect = content.getBoundingClientRect();
                     const y = e.clientY - rect.top;
                     onAddBgaIntervalAt(yToTime(y));
                   }
                   return;
                 }
                 // 이동 모드에서는 노트 클릭 시 삭제하지 않고 드래그만 허용
                 if (!isMoveMode) {
                   onNoteClick(note.id);
                 }
               }}
               style={{
                 position: 'absolute',
                 left: `${displayLeft}px`,
                 top: `${topPosition}px`,
                 width: `${displayWidth}px`,
                 height: `${noteHeight}px`,
                 cursor: isMoveMode && isSelected ? 'move' : 'pointer',
                 zIndex: isSelected ? (dragOffset ? 15 : 12) : 10,
                 opacity,
                 transition: dragOffset ? 'none' : 'opacity 0.2s',
                 userSelect: 'none',
                 // 선택 표시(탭/롱 공통): 윈도우식 마퀴 선택이 눈에 띄도록 글로우 추가
                 borderRadius: isHold ? 18 : 14,
                 boxShadow: isSelected
                   ? '0 0 0 3px rgba(96, 165, 250, 0.95), 0 0 18px rgba(96, 165, 250, 0.45)'
                   : undefined,
               }}
             >
              <div
                style={{
                  position: 'absolute',
                  left: `${visualLeft - displayLeft}px`,
                  width: `${visualWidth}px`,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
               }}
             >
              {isHold ? (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: holdGradient,
                    borderRadius: 18,
                    border: '2px solid rgba(255,255,255,0.25)',
                    boxShadow: isOddLane
                      ? '0 0 18px rgba(255, 214, 102, 0.8)'
                      : '0 6px 16px rgba(0,0,0,0.45)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: tapGradient,
                    border: `3px solid ${tapBorder}`,
                    borderRadius: 14,
                    boxShadow: '0 6px 14px rgba(0, 0, 0, 0.45)',
                  }}
                />
              )}
              </div>
            </div>
          );
        })}

        {/* (removed) 세로 선택 영역 */}

        {/* 재생선 */}
        <div
          ref={playheadRef}
          data-playhead
          onMouseDown={onPlayheadMouseDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${CONTENT_WIDTH}px`,
            height: `${PLAYHEAD_HIT_HEIGHT}px`, // 클릭 영역 높이 확장
            cursor: 'ns-resize',
            zIndex: PLAYHEAD_Z_INDEX,
            display: 'flex',
            alignItems: 'center', // 내부 선 중앙 정렬
            transform: `translate3d(0, ${playheadY - PLAYHEAD_HIT_HEIGHT / 2}px, 0)`,
            willChange: 'transform',
          }}
        >
          {/* 시각적인 재생선 (빨간 선) */}
          <div
            style={{
              width: '100%',
              height: '3px',
              borderRadius: 999,
              background: 'linear-gradient(90deg, rgba(255, 68, 68, 0), #ff1f1f 8%, #ff5a5a 50%, #ff1f1f 92%, rgba(255, 68, 68, 0))',
              boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.18), 0 0 14px rgba(255, 0, 0, 0.75)',
            }}
          />
        </div>

        {/* 마디 번호 표시 (재생선 오른쪽) */}
        <div
          ref={measureLabelRef}
          style={{
            position: 'absolute',
            left: `${CONTENT_WIDTH + 8}px`,
            top: 0,
            fontSize: '11px',
            color: '#FF0000',
            fontWeight: 'bold',
            textShadow: '0 0 4px rgba(255, 0, 0, 0.8)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: PLAYHEAD_Z_INDEX,
            transform: `translate3d(0, ${playheadY - 6}px, 0)`,
            willChange: 'transform',
          }}
        >
          {currentMeasureLabel}
        </div>
        </div>
      </div>
    </div>
    </>
  );
});
