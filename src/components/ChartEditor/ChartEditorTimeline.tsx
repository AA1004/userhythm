import React, { useMemo } from 'react';
import { Note, TimeSignatureEvent } from '../../types/game';
import { LANE_POSITIONS, TAP_NOTE_HEIGHT, TIMELINE_BOTTOM_PADDING, CHART_EDITOR_THEME } from './constants';

interface ChartEditorTimelineProps {
  notes: Note[];
  sortedTimeSignatures: TimeSignatureEvent[];
  beatDuration: number;
  timelineDurationMs: number;
  gridDivision: number;
  timeSignatureOffset: number;
  playheadY: number;
  isAutoScrollEnabled: boolean;
  timelineContentHeight: number;
  timelineScrollRef: React.RefObject<HTMLDivElement>;
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
  playheadY,
  timelineContentHeight,
  timelineScrollRef,
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
        {/* 레인 배경 */}
        {LANE_POSITIONS.map((x, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: `${x - 50}px`,
              top: 0,
              width: '100px',
              height: '100%',
              background:
                index % 2 === 0
                  ? 'linear-gradient(180deg, #020617 0%, #020617 40%, #020617 100%)'
                  : 'linear-gradient(180deg, #020617 0%, #020617 40%, #020617 100%)',
              boxShadow:
                'inset 1px 0 0 rgba(15,23,42,0.9), inset -1px 0 0 rgba(15,23,42,0.9)',
            }}
          />
        ))}

        {/* 레인 구분선 */}
        {LANE_POSITIONS.map((x, index) => (
          <div
            key={`divider-${index}`}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: 0,
              width: '2px',
              height: '100%',
              backgroundColor: 'rgba(148, 163, 184, 0.25)',
              transform: 'translateX(-50%)',
            }}
          />
        ))}

        {/* 그리드 라인 */}
        {gridLines.map((line, index) => (
          <div
            key={`grid-${index}`}
            style={{
              position: 'absolute',
              left: LANE_POSITIONS[0] - 50,
              top: `${line.y}px`,
              width: `${LANE_POSITIONS[3] - LANE_POSITIONS[0] + 100}px`,
              height: '1px',
              backgroundColor: line.isMeasure
                ? 'rgba(56, 189, 248, 0.55)'
                : 'rgba(148, 163, 184, 0.25)',
            }}
          />
        ))}

        {/* 판정선 */}
        <div
          style={{
            position: 'absolute',
            left: LANE_POSITIONS[0] - 50,
            top: `${TIMELINE_BOTTOM_PADDING}px`,
            width: `${LANE_POSITIONS[3] - LANE_POSITIONS[0] + 100}px`,
            height: '3px',
            background:
              'linear-gradient(90deg, rgba(244, 244, 245, 0) 0%, #facc15 20%, #f97316 80%, rgba(244, 244, 245, 0) 100%)',
            boxShadow: '0 0 16px rgba(250, 204, 21, 0.55)',
          }}
        />

        {/* 노트 렌더링 */}
        {notes.map((note) => {
          const startY = getNoteY(note.time);
          const isHold = note.duration > 0 || note.type === 'hold';
          const endY = isHold ? timeToY(note.endTime || note.time + note.duration) : startY;
          const noteHeight = isHold
            ? Math.max(30, Math.abs(endY - startY))
            : TAP_NOTE_HEIGHT;
          const topPosition = isHold ? Math.min(startY, endY) : startY - TAP_NOTE_HEIGHT / 2;
          const isOddLane = note.lane === 0 || note.lane === 2;
          const baseColor = isOddLane ? '#f97373' : '#22c3d6';
          const borderColor = isOddLane ? '#fb7185' : '#22d3ee';
          const holdGradient = isOddLane
            ? 'linear-gradient(180deg, rgba(255,107,107,0.95) 0%, rgba(255,138,128,0.65) 100%)'
            : 'linear-gradient(180deg, rgba(78,205,196,0.95) 0%, rgba(94,234,212,0.65) 100%)';

          return (
            <div
              key={note.id}
              onClick={(e) => {
                e.stopPropagation();
                onNoteClick(note.id);
              }}
              style={{
                position: 'absolute',
                left: `${LANE_POSITIONS[note.lane] - 25}px`,
                top: `${topPosition}px`,
                width: '50px',
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
                    border: `2px solid ${borderColor}`,
                  borderRadius: 10,
                  boxShadow: '0 10px 20px rgba(15, 23, 42, 0.8)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: `linear-gradient(180deg, ${baseColor} 0%, ${baseColor}dd 100%)`,
                    border: `3px solid ${borderColor}`,
                  borderRadius: 14,
                  boxShadow: '0 14px 28px rgba(15, 23, 42, 0.95)',
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
            left: LANE_POSITIONS[0] - 50,
            top: `${playheadY}px`,
            width: `${LANE_POSITIONS[3] - LANE_POSITIONS[0] + 100}px`,
            height: '2px',
            backgroundColor: '#FF0000',
            cursor: 'ns-resize',
            zIndex: 100,
            boxShadow: '0 0 10px rgba(255, 0, 0, 0.5)',
          }}
        >
          {/* 재생선 핸들 */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '12px',
              height: '12px',
              backgroundColor: '#FF0000',
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 0 8px rgba(255, 0, 0, 0.8)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
