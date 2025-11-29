import React, { useMemo, useRef, useCallback } from 'react';
import { SubtitleCue, SubtitleTrack } from '../../types/subtitle';
import { PIXELS_PER_SECOND, CHART_EDITOR_THEME } from '../ChartEditor/constants';

export interface SubtitleTimelineProps {
  tracks: SubtitleTrack[];
  subtitles: SubtitleCue[];
  /** 타임라인 전체 길이(ms) */
  durationMs: number;
  currentTimeMs: number;
  onChangeCurrentTime: (timeMs: number) => void;
  onSelectSubtitle: (id: string | null) => void;
  onChangeSubtitleTime: (id: string, startTimeMs: number, endTimeMs: number) => void;
}

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface DragState {
  id: string;
  mode: DragMode;
  originClientX: number;
  originStart: number;
  originEnd: number;
}

const MIN_SUBTITLE_DURATION = 100; // ms

export const SubtitleTimeline: React.FC<SubtitleTimelineProps> = ({
  tracks,
  subtitles,
  durationMs,
  currentTimeMs,
  onChangeCurrentTime,
  onSelectSubtitle,
  onChangeSubtitleTime,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const isDraggingPlayheadRef = useRef<boolean>(false);

  const widthPx = useMemo(() => {
    const base = (durationMs / 1000) * PIXELS_PER_SECOND;
    return Math.max(base, 800);
  }, [durationMs]);

  const timeToX = useCallback(
    (timeMs: number) => (timeMs / 1000) * PIXELS_PER_SECOND,
    []
  );

  const xToTime = useCallback(
    (x: number) => Math.max(0, Math.min(durationMs, (x / PIXELS_PER_SECOND) * 1000)),
    [durationMs]
  );

  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    if (isDraggingPlayheadRef.current) return; // 재생선 드래그 중이면 무시
    // 클립 위 클릭은 상위에서 stopPropagation 하므로 여기서는 타임라인 빈 곳만 처리
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const time = xToTime(x);
    onSelectSubtitle(null);
    onChangeCurrentTime(time);
  };

  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 기본 드래그 동작 방지
    e.stopPropagation();
    isDraggingPlayheadRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (scrollRef.current) {
        const rect = scrollRef.current.getBoundingClientRect();
        // 스크롤된 상태를 고려하여 X 좌표 계산
        const relativeX = moveEvent.clientX - rect.left + scrollRef.current.scrollLeft;
        const newTime = xToTime(relativeX);
        onChangeCurrentTime(newTime);
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      // 최종 위치로 이동
      if (scrollRef.current) {
        const rect = scrollRef.current.getBoundingClientRect();
        const relativeX = upEvent.clientX - rect.left + scrollRef.current.scrollLeft;
        const newTime = xToTime(relativeX);
        onChangeCurrentTime(newTime);
      }
      
      // 약간의 지연 후 드래그 상태 해제 (클릭 이벤트 전파 방지)
      setTimeout(() => {
        isDraggingPlayheadRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [xToTime, onChangeCurrentTime]);

  const beginDrag = (
    cue: SubtitleCue,
    mode: DragMode,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();

    dragStateRef.current = {
      id: cue.id,
      mode,
      originClientX: e.clientX,
      originStart: cue.startTimeMs,
      originEnd: cue.endTimeMs,
    };

    const handleMove = (ev: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const deltaX = ev.clientX - state.originClientX;
      const deltaMs = (deltaX / PIXELS_PER_SECOND) * 1000;

      if (state.mode === 'move') {
        let nextStart = state.originStart + deltaMs;
        let nextEnd = state.originEnd + deltaMs;
        // 타임라인 범위 클램프
        const duration = nextEnd - nextStart;
        nextStart = Math.max(0, Math.min(nextStart, durationMs - duration));
        nextEnd = nextStart + duration;
        onChangeSubtitleTime(state.id, nextStart, nextEnd);
      } else if (state.mode === 'resize-start') {
        let nextStart = state.originStart + deltaMs;
        nextStart = Math.max(0, Math.min(nextStart, state.originEnd - MIN_SUBTITLE_DURATION));
        onChangeSubtitleTime(state.id, nextStart, state.originEnd);
      } else if (state.mode === 'resize-end') {
        let nextEnd = state.originEnd + deltaMs;
        nextEnd = Math.min(durationMs, Math.max(nextEnd, state.originStart + MIN_SUBTITLE_DURATION));
        onChangeSubtitleTime(state.id, state.originStart, nextEnd);
      }
    };

    const handleUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div
      style={{
        height: 220,
        borderTop: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        backgroundColor: '#020617',
      }}
    >
      <div
        ref={scrollRef}
        onClick={handleBackgroundClick}
        style={{
          height: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          position: 'relative',
          cursor: 'default',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: widthPx,
            height: '100%',
            padding: '12px 0',
            boxSizing: 'border-box',
          }}
        >
          {/* 수직 그리드 라인 (1초 단위) */}
          {Array.from({ length: Math.ceil(durationMs / 1000) + 1 }).map((_, i) => {
            const x = timeToX(i * 1000);
            return (
              <div
                key={`grid-${i}`}
                style={{
                  position: 'absolute',
                  left: x,
                  top: 0,
                  width: 1,
                  height: '100%',
                  backgroundColor:
                    i % 4 === 0
                      ? 'rgba(148,163,184,0.45)'
                      : 'rgba(30,64,175,0.4)',
                }}
              />
            );
          })}

          {/* 현재 재생 위치 라인 */}
          <div
            onMouseDown={handlePlayheadMouseDown}
            style={{
              position: 'absolute',
              left: timeToX(currentTimeMs) - 10, // 클릭 영역 확장을 위해 좌측으로 확장
              top: 0,
              width: 22, // 클릭 영역 확장 (2px 선 + 좌우 10px씩)
              height: '100%',
              cursor: 'ew-resize',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* 시각적인 재생선 */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 2,
                height: '100%',
                background:
                  'linear-gradient(180deg, rgba(248,250,252,0.2), rgba(251,113,133,0.95))',
                boxShadow: '0 0 18px rgba(248,113,133,0.8)',
              }}
            />
          </div>

          {/* 트랙 레인 */}
          {tracks.map((track, index) => {
            const laneTop = 32 + index * 52;
            const laneSubtitles = subtitles.filter((s) => {
              const trackId = s.trackId ?? s.style.trackId ?? 'default';
              return trackId === track.id;
            });

            return (
              <div key={track.id}>
                {/* 트랙 라벨 */}
                <div
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: laneTop - 26,
                    fontSize: 11,
                    color: CHART_EDITOR_THEME.textSecondary,
                  }}
                >
                  {track.name}
                </div>

                {/* 트랙 배경 */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: laneTop - 4,
                    width: widthPx,
                    height: 40,
                    borderRadius: 6,
                    background:
                      'linear-gradient(90deg, rgba(15,23,42,0.95), rgba(30,64,175,0.35))',
                    boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.9)',
                  }}
                />

                {/* 자막 클립 */}
                {laneSubtitles.map((cue) => {
                  const left = timeToX(cue.startTimeMs);
                  const width = Math.max(
                    timeToX(cue.endTimeMs) - left,
                    (MIN_SUBTITLE_DURATION / 1000) * PIXELS_PER_SECOND
                  );

                  return (
                    <div
                      key={cue.id}
                      onMouseDown={(e) => beginDrag(cue, 'move', e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSubtitle(cue.id);
                      }}
                      style={{
                        position: 'absolute',
                        left,
                        top: laneTop,
                        width,
                        height: 32,
                        borderRadius: 8,
                        background:
                          'linear-gradient(135deg, rgba(56,189,248,0.85), rgba(37,99,235,0.95))',
                        boxShadow: '0 8px 20px rgba(15,23,42,0.9)',
                        border: '1px solid rgba(56,189,248,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 6px',
                        boxSizing: 'border-box',
                        color: '#0b1120',
                        fontSize: 11,
                        cursor: 'grab',
                      }}
                    >
                      {/* 시작 핸들 */}
                      <div
                        onMouseDown={(e) => beginDrag(cue, 'resize-start', e)}
                        style={{
                          width: 6,
                          alignSelf: 'stretch',
                          borderRadius: 4,
                          backgroundColor: 'rgba(15,23,42,0.85)',
                          cursor: 'ew-resize',
                          marginRight: 4,
                        }}
                      />
                      {/* 텍스트 요약 */}
                      <div
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cue.text || '(빈 자막)'}
                      </div>
                      {/* 끝 핸들 */}
                      <div
                        onMouseDown={(e) => beginDrag(cue, 'resize-end', e)}
                        style={{
                          width: 6,
                          alignSelf: 'stretch',
                          borderRadius: 4,
                          backgroundColor: 'rgba(15,23,42,0.85)',
                          cursor: 'ew-resize',
                          marginLeft: 4,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


