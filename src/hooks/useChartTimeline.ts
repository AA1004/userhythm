import { useMemo } from 'react';

interface UseChartTimelineOptions {
  zoom: number;
  currentTime: number;
  TIMELINE_TOP_PADDING: number;
  PIXELS_PER_SECOND: number;
}

/**
 * 타임라인 계산 관련 커스텀 훅
 * 시간과 Y 좌표 간 변환 및 노트 위치 계산
 */
export function useChartTimeline({
  zoom,
  currentTime,
  TIMELINE_TOP_PADDING,
  PIXELS_PER_SECOND,
}: UseChartTimelineOptions) {
  // 시간(ms)을 Y 좌표로 변환
  const timeToY = useMemo(() => {
    return (timeMs: number): number => {
      return TIMELINE_TOP_PADDING + (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
    };
  }, [zoom, TIMELINE_TOP_PADDING, PIXELS_PER_SECOND]);

  // Y 좌표를 시간(ms)으로 변환
  const yToTime = useMemo(() => {
    return (y: number): number => {
      const relativeY = y - TIMELINE_TOP_PADDING;
      return (relativeY / (PIXELS_PER_SECOND * zoom)) * 1000;
    };
  }, [zoom, TIMELINE_TOP_PADDING, PIXELS_PER_SECOND]);

  // 노트의 Y 위치 계산
  const getNoteY = useMemo(() => {
    return (noteTime: number): number => {
      return timeToY(noteTime);
    };
  }, [timeToY]);

  // 재생선의 Y 위치 계산
  const playheadY = useMemo(() => {
    return timeToY(currentTime);
  }, [timeToY, currentTime]);

  return {
    timeToY,
    yToTime,
    getNoteY,
    playheadY,
  };
}
