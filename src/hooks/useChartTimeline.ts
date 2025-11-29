import { useMemo } from 'react';

interface UseChartTimelineOptions {
  zoom: number;
  currentTime: number;
  TIMELINE_TOP_PADDING: number;
  TIMELINE_BOTTOM_PADDING: number;
  PIXELS_PER_SECOND: number;
  timelineContentHeight: number;
}

/**
 * 타임라인 계산 관련 커스텀 훅
 * 시간과 Y 좌표 간 변환 및 노트 위치 계산
 * 재생선은 아래에서 위로 올라가는 방향으로 동작합니다.
 */
export function useChartTimeline({
  zoom,
  currentTime,
  TIMELINE_TOP_PADDING,
  TIMELINE_BOTTOM_PADDING,
  PIXELS_PER_SECOND,
  timelineContentHeight,
}: UseChartTimelineOptions) {
  // 시간(ms)을 Y 좌표로 변환 (아래에서 위로 올라가는 방향)
  // 시간이 증가하면 Y 좌표는 감소 (위로 올라감)
  const timeToY = useMemo(() => {
    return (timeMs: number): number => {
      // 타임라인 전체 높이에서 시간에 따른 오프셋을 빼서 위로 올라가도록 함
      return timelineContentHeight - TIMELINE_BOTTOM_PADDING - (timeMs / 1000) * PIXELS_PER_SECOND * zoom;
    };
  }, [zoom, TIMELINE_BOTTOM_PADDING, PIXELS_PER_SECOND, timelineContentHeight]);

  // Y 좌표를 시간(ms)으로 변환
  const yToTime = useMemo(() => {
    return (y: number): number => {
      // Y 좌표를 시간으로 변환 (반대 계산)
      const relativeY = timelineContentHeight - TIMELINE_BOTTOM_PADDING - y;
      return (relativeY / (PIXELS_PER_SECOND * zoom)) * 1000;
    };
  }, [zoom, TIMELINE_BOTTOM_PADDING, PIXELS_PER_SECOND, timelineContentHeight]);

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
