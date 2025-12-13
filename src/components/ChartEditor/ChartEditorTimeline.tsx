import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Note, TimeSignatureEvent, SpeedChange, BPMChange, BgaVisibilityInterval, Lane } from '../../types/game';
import {
  LANE_POSITIONS,
  LANE_WIDTH,
  TAP_NOTE_HEIGHT,
  TIMELINE_BOTTOM_PADDING,
} from './constants';
import { timeToMeasure } from '../../utils/bpmUtils';

// 노트가 레인 경계선 안에 딱 맞게 들어가도록 레인 너비에서 약간의 여백만 남김
const NOTE_WIDTH = LANE_WIDTH - 4;
const NOTE_HALF = NOTE_WIDTH / 2;
// 래퍼 전체 너비 (4개 레인 × 100px)
const CONTENT_WIDTH = LANE_WIDTH * 4;

interface ChartEditorTimelineProps {
  notes: Note[];
  sortedTimeSignatures: TimeSignatureEvent[];
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
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
  bgaVisibilityIntervals?: BgaVisibilityInterval[];
  // 선택 영역 관련
  isSelectionMode?: boolean;
  selectedLane?: Lane | null;
  isMoveMode?: boolean;
  selectedNoteIds?: Set<number>;
  dragOffset?: { time: number; lane: number } | null;
  selectionStartTime?: number | null;
  selectionEndTime?: number | null;
  onSelectionStart?: (timeMs: number, lane: Lane | null) => void;
  onSelectionUpdate?: (timeMs: number) => void;
  onSelectionEnd?: () => void;
  onMoveStart?: (timeMs: number, lane: Lane | null, noteId?: number) => void;
  onMoveUpdate?: (timeOffset: number, laneOffset: number) => void;
  onMoveEnd?: () => void;
  yToTime: (y: number) => number;
}

export const ChartEditorTimeline: React.FC<ChartEditorTimelineProps> = ({
  notes,
  sortedTimeSignatures,
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
  getNoteY,
  currentTime,
  bpm,
  bpmChanges,
  beatsPerMeasure,
  bgaVisibilityIntervals = [],
  isSelectionMode = false,
  selectedLane: _selectedLane = null,
  isMoveMode = false,
  selectedNoteIds = new Set(),
  dragOffset = null,
  selectionStartTime,
  selectionEndTime,
  onSelectionStart,
  onSelectionUpdate,
  onSelectionEnd,
  onMoveStart,
  onMoveUpdate,
  onMoveEnd,
  yToTime,
}) => {
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
    const beatsPerMeasure = sortedTimeSignatures[0]?.beatsPerMeasure || 4;
    const safeBeatDuration = Math.max(1, beatDuration);
    const beatsPerSecond = 1000 / safeBeatDuration; // beatDuration(ms) ⇒ beats/sec
    const totalBeats = (timelineDurationMs / 1000) * beatsPerSecond;

    for (let beat = 0; beat <= totalBeats; beat += 1 / gridDivision) {
      const timeMs = (beat * beatDuration) + timeSignatureOffset;
      if (timeMs < 0 || timeMs > timelineDurationMs) continue;

      const y = timeToY(timeMs);
      const isMeasure = beat % beatsPerMeasure === 0;
      lines.push({ y, isMeasure });
    }

    return lines;
  }, [timelineDurationMs, beatDuration, gridDivision, timeSignatureOffset, sortedTimeSignatures, timeToY]);

  const paddedTop = Math.max(0, viewTop - VIRTUAL_BUFFER);
  const paddedBottom = viewBottom + VIRTUAL_BUFFER;

  const visibleGridLines = useMemo(
    () => gridLines.filter((line) => line.y >= paddedTop && line.y <= paddedBottom),
    [gridLines, paddedTop, paddedBottom]
  );

  // 노트 높이는 줌과 무관하게 고정 (타임라인 스케일만 줌에 따라 변함)
  const tapNoteHeight = TAP_NOTE_HEIGHT;

  const preparedNotes = useMemo(
    () =>
      notes.map((note) => {
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
        
        const noteY = getNoteY(effectiveTime);
        const isHold = note.duration > 0 || note.type === 'hold';
        const endTime = isHold ? (note.endTime || note.time + note.duration) : effectiveTime;
        const endY = isHold ? timeToY(endTime) : noteY;
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
      }),
    [notes, getNoteY, timeToY, tapNoteHeight, selectedNoteIds, dragOffset]
  );

  const visibleNotes = useMemo(
    () =>
      preparedNotes.filter(
        (n) => n.bottom >= paddedTop && n.topPosition <= paddedBottom
      ),
    [preparedNotes, paddedTop, paddedBottom]
  );

  const visibleSpeedChanges = useMemo(
    () =>
      speedChanges
        .map((sc) => ({ sc, y: timeToY(sc.startTimeMs) }))
        .filter(({ y }) => y >= paddedTop && y <= paddedBottom),
    [speedChanges, timeToY, paddedTop, paddedBottom]
  );

  const visibleBgaIntervals = useMemo(
    () =>
      bgaVisibilityIntervals
        .map((interval) => {
          const top = Math.min(timeToY(interval.startTimeMs), timeToY(interval.endTimeMs));
          const height = Math.max(2, Math.abs(timeToY(interval.endTimeMs) - timeToY(interval.startTimeMs)));
          return { interval, top, height };
        })
        .filter(({ top, height }) => {
          const bottom = top + height;
          return bottom >= paddedTop && top <= paddedBottom;
        }),
    [bgaVisibilityIntervals, timeToY, paddedTop, paddedBottom]
  );

  // 초기 한 번만 스크롤을 재생선 위치로 설정 (재생선이 화면 중앙에 오도록)
  const didInitScrollRef = useRef(false);
  const lastTimelineHeightRef = useRef<number | null>(null);
  useEffect(() => {
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
      const targetScrollTop = Math.max(0, playheadY - centerOffset);
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
  }, [timelineContentHeight, playheadY]);

  // 드래그 선택 핸들러
  const isDraggingSelectionRef = useRef(false);
  const isDraggingMoveRef = useRef(false);
  const moveStartRef = useRef<{ time: number; lane: number } | null>(null);
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left;
    const time = yToTime(y);
    
    // X 좌표로 레인 감지
    let detectedLane: Lane | null = null;
    const relativeX = x - rect.left;
    for (let i = 0; i < LANE_POSITIONS.length; i++) {
      const laneCenter = LANE_POSITIONS[i];
      const laneLeft = laneCenter - LANE_WIDTH / 2;
      const laneRight = laneCenter + LANE_WIDTH / 2;
      if (relativeX >= laneLeft && relativeX < laneRight) {
        detectedLane = i as Lane;
        break;
      }
    }
    
    isDraggingSelectionRef.current = true;
    if (onSelectionStart) {
      onSelectionStart(time, detectedLane);
    }
    
    e.preventDefault();
  }, [isSelectionMode, isMoveMode, selectedNoteIds, yToTime, onSelectionStart, onMoveStart, timelineContentRef]);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
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
    
    // 선택 모드 드래그 처리
    if (!isDraggingSelectionRef.current || !onSelectionUpdate) return;
    if (!timelineContentRef.current) return;
    
    const rect = timelineContentRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const time = yToTime(y);
    
    onSelectionUpdate(time);
  }, [yToTime, onSelectionUpdate, onMoveUpdate, timelineContentRef]);
  
  const handleMouseUp = useCallback(() => {
    if (isDraggingMoveRef.current) {
      if (onMoveEnd) {
        onMoveEnd();
      }
      isDraggingMoveRef.current = false;
      moveStartRef.current = null;
    }
    if (isDraggingSelectionRef.current && onSelectionEnd) {
      onSelectionEnd();
    }
    isDraggingSelectionRef.current = false;
  }, [onSelectionEnd, onMoveEnd]);
  
  useEffect(() => {
    if (isDraggingSelectionRef.current || isDraggingMoveRef.current) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [handleMouseMove, handleMouseUp]);

  // 선택 영역 렌더링 계산
  const selectionBox = useMemo(() => {
    if (selectionStartTime == null || selectionEndTime == null) return null;
    
    const startTime = Math.min(selectionStartTime, selectionEndTime);
    const endTime = Math.max(selectionStartTime, selectionEndTime);
    
    const startY = timeToY(startTime);
    const endY = timeToY(endTime);
    
    return {
      top: Math.min(startY, endY),
      height: Math.abs(endY - startY),
    };
  }, [selectionStartTime, selectionEndTime, timeToY]);

  return (
    <div
      ref={timelineScrollRef}
      onClick={onTimelineClick}
      onMouseDown={handleMouseDown}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        background:
          'radial-gradient(circle at top, rgba(15,23,42,0.9), rgba(15,23,42,1))',
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
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${CONTENT_WIDTH}px`,
            height: '100%',
        }}
      >
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

        {/* 간주 구간 오버레이 (채보 레인 숨김) */}
        {visibleBgaIntervals.map(({ interval, top, height }) => {
          const total = Math.max(1, Math.abs(interval.endTimeMs - interval.startTimeMs));
          const fadeInRatio = Math.min(1, Math.max(0, (interval.fadeInMs ?? 0) / total));
          const fadeOutRatio = Math.min(1, Math.max(0, (interval.fadeOutMs ?? 0) / total));
          const midStart = fadeInRatio;
          const midEnd = Math.max(midStart, 1 - fadeOutRatio);
          const baseColor =
            interval.mode === 'hidden'
              ? 'rgba(248,113,113,0.22)'
              : 'rgba(74,222,128,0.18)';
          const gradient = `linear-gradient(to bottom,
            rgba(0,0,0,0) 0%,
            ${baseColor} ${midStart * 100}%,
            ${baseColor} ${midEnd * 100}%,
            rgba(0,0,0,0) 100%)`;

          return (
            <div
              key={interval.id}
              style={{
                position: 'absolute',
                left: 0,
                top: `${top}px`,
                width: `${CONTENT_WIDTH}px`,
                height: `${height}px`,
                background: gradient,
                border: `1px dashed ${interval.mode === 'hidden' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}`,
                borderRadius: 6,
                boxShadow:
                  interval.mode === 'hidden'
                    ? '0 0 12px rgba(248,113,113,0.35)'
                    : '0 0 12px rgba(74,222,128,0.35)',
                zIndex: 6,
              }}
              title={`간주 구간 (채보 레인 ${interval.mode === 'hidden' ? '숨김' : '표시'}) (${interval.startTimeMs}ms ~ ${interval.endTimeMs}ms)`}
            >
              <span
                style={{
                  position: 'absolute',
                  right: 6,
                  top: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: interval.mode === 'hidden' ? '#fca5a5' : '#bbf7d0',
                  textShadow: '0 0 6px rgba(0,0,0,0.65)',
                  pointerEvents: 'none',
                }}
              >
                {interval.mode === 'hidden' ? 'HIDE' : 'SHOW'}
              </span>
            </div>
          );
        })}

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
               onClick={(e) => {
                 e.stopPropagation();
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
                 zIndex: isSelected && dragOffset ? 15 : 10,
                 opacity,
                 transition: dragOffset ? 'none' : 'opacity 0.2s',
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

        {/* 선택 영역 */}
        {selectionBox && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: `${selectionBox.top}px`,
              width: `${CONTENT_WIDTH}px`,
              height: `${selectionBox.height}px`,
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '2px dashed rgba(59, 130, 246, 0.6)',
              borderRadius: 4,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        )}

        {/* 재생선 */}
        <div
          data-playhead
          onMouseDown={onPlayheadMouseDown}
          style={{
            position: 'absolute',
            left: 0,
            top: `${playheadY - 10}px`, // 클릭 영역 확장을 위해 위로 올림
            width: `${CONTENT_WIDTH}px`,
            height: '20px', // 클릭 영역 높이 확장
            cursor: 'ns-resize',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center', // 내부 선 중앙 정렬
          }}
        >
          {/* 시각적인 재생선 (빨간 선) */}
          <div
            style={{
              width: '100%',
              height: '2px',
              backgroundColor: '#FF0000',
              boxShadow: '0 0 10px rgba(255, 0, 0, 0.5)',
            }}
          />
        </div>
        
        {/* 마디 번호 표시 (재생선 오른쪽) */}
        <div
          style={{
            position: 'absolute',
            left: `${CONTENT_WIDTH + 8}px`,
            top: `${playheadY}px`,
            transform: 'translateY(-50%)',
            fontSize: '11px',
            color: '#FF0000',
            fontWeight: 'bold',
            textShadow: '0 0 4px rgba(255, 0, 0, 0.8)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {timeToMeasure(currentTime, bpm, bpmChanges, beatsPerMeasure)}마디
        </div>
        </div>
      </div>
    </div>
  );
};
