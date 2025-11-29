import React, { useMemo, useEffect } from 'react';
import { Note, TimeSignatureEvent, SpeedChange } from '../../types/game';
import {
  LANE_POSITIONS,
  LANE_WIDTH,
  PIXELS_PER_SECOND,
  TAP_NOTE_HEIGHT,
  TIMELINE_BOTTOM_PADDING,
} from './constants';

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
  zoom,
  onTimelineClick,
  onPlayheadMouseDown,
  onNoteClick,
  timeToY,
  getNoteY,
}) => {
  // 그리드 라인 생성
  const gridLines = useMemo(() => {
    const lines: Array<{ y: number; isMeasure: boolean }> = [];
    const beatsPerMeasure = sortedTimeSignatures[0]?.beatsPerMeasure || 4;
    const totalBeats = (timelineDurationMs / 1000) * (60 / (60000 / beatDuration));

    for (let beat = 0; beat <= totalBeats; beat += 1 / gridDivision) {
      const timeMs = (beat * beatDuration) + timeSignatureOffset;
      if (timeMs < 0 || timeMs > timelineDurationMs) continue;

      const y = timeToY(timeMs);
      const isMeasure = beat % beatsPerMeasure === 0;
      lines.push({ y, isMeasure });
    }

    return lines;
  }, [timelineDurationMs, beatDuration, gridDivision, timeSignatureOffset, sortedTimeSignatures, timeToY]);

  const gridCellHeight = useMemo(() => {
    const cellDurationMs = beatDuration / Math.max(1, gridDivision);
    const rawHeight =
      (cellDurationMs / 1000) * PIXELS_PER_SECOND * Math.max(0.2, zoom);
    return Math.max(12, rawHeight);
  }, [beatDuration, gridDivision, zoom]);

  const tapNoteHeight = useMemo(() => {
    const candidate = gridCellHeight - 8;
    const maxHeight = NOTE_WIDTH * 0.8;
    const fallback = TAP_NOTE_HEIGHT;
    return Math.max(18, Math.min(candidate || fallback, maxHeight));
  }, [gridCellHeight]);

  // 초기 스크롤을 하단(판정선 위치)으로 설정
  useEffect(() => {
    if (!timelineScrollRef.current) return;
    const container = timelineScrollRef.current;
    // 스크롤을 최하단으로 이동 (판정선이 보이도록)
    container.scrollTop = container.scrollHeight;
  }, [timelineContentHeight, timelineScrollRef]);

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
          const effectiveTapHeight = tapNoteHeight || TAP_NOTE_HEIGHT;
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
      </div>
      </div>
    </div>
  );
};
