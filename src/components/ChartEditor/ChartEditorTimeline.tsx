import React, { useMemo, useEffect, useRef } from 'react';
import { Note, TimeSignatureEvent, SpeedChange, BPMChange, BgaVisibilityInterval } from '../../types/game';
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
}) => {
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

  // 노트 높이는 줌과 무관하게 고정 (타임라인 스케일만 줌에 따라 변함)
  const tapNoteHeight = TAP_NOTE_HEIGHT;

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

  return (
    <div
      ref={timelineScrollRef}
      onClick={onTimelineClick}
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
              boxShadow:
                'inset 1px 0 0 rgba(15,23,42,0.9), inset -1px 0 0 rgba(15,23,42,0.9)',
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
        {gridLines.map((line, index) => (
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
        {speedChanges.map((sc) => {
          const y = timeToY(sc.startTimeMs);
          return (
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
          );
        })}

        {/* BGA 가림 구간 오버레이 */}
        {bgaVisibilityIntervals.map((interval) => {
          const startY = timeToY(interval.startTimeMs);
          const endY = timeToY(interval.endTimeMs);
          const top = Math.min(startY, endY);
          const height = Math.max(2, Math.abs(endY - startY));
          const total = Math.max(1, Math.abs(interval.endTimeMs - interval.startTimeMs));
          const fadeInRatio = Math.min(1, Math.max(0, (interval.fadeInMs ?? 0) / total));
          const fadeOutRatio = Math.min(1, Math.max(0, (interval.fadeOutMs ?? 0) / total));
          // 겹침 방지: 페이드 구간이 겹치면 만나는 지점에서 색상을 유지하도록 보정
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
              title={`BGA ${interval.mode === 'hidden' ? '숨김' : '표시'} (${interval.startTimeMs}ms ~ ${interval.endTimeMs}ms)`}
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
        {notes.map((note) => {
          const effectiveTapHeight = tapNoteHeight;
          // 노트 중심이 그리드 가로선 위에 정확히 오도록 (gridCellHalf 오프셋 제거)
          const noteY = getNoteY(note.time);
          const isHold = note.duration > 0 || note.type === 'hold';
          const endY = isHold
            ? timeToY(note.endTime || note.time + note.duration)
            : noteY;
          const topPosition = isHold
            ? Math.min(noteY, endY) - effectiveTapHeight / 2
            : noteY - effectiveTapHeight / 2;
          const noteHeight = isHold
            ? Math.max(
                effectiveTapHeight,
                Math.abs(endY - noteY) + effectiveTapHeight
              )
            : effectiveTapHeight;
          const isOddLane = note.lane === 0 || note.lane === 2;
          const tapGradient = isOddLane
            ? 'linear-gradient(180deg, #FF6B6B 0%, #FF9A8B 100%)'
            : 'linear-gradient(180deg, #4ECDC4 0%, #4AC8E7 100%)';
          const tapBorder = isOddLane ? '#EE5A52' : '#45B7B8';
          const holdGradient = isOddLane
            ? 'linear-gradient(180deg, rgba(255,231,157,0.95) 0%, rgba(255,193,7,0.65) 100%)'
            : 'linear-gradient(180deg, rgba(78,205,196,0.9) 0%, rgba(32,164,154,0.7) 100%)';

          return (
            <div
              key={note.id}
              onClick={(e) => {
                e.stopPropagation();
                onNoteClick(note.id);
              }}
              style={{
                position: 'absolute',
                left: `${LANE_POSITIONS[note.lane] - NOTE_HALF}px`,
                top: `${topPosition}px`,
                width: `${NOTE_WIDTH}px`,
                height: `${noteHeight}px`,
                cursor: 'pointer',
                zIndex: 10,
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
          );
        })}

        {/* 재생선 */}
        <div
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
