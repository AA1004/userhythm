import React, { useEffect, useMemo, useRef } from 'react';
import type {
  BgaVisibilityInterval,
  BPMChange,
  LanePositionInterval,
  Note,
  SpeedChange,
} from '../../types/game';
import {
  beatIndexToTimeFromSortedChanges,
  timeToBeatIndexFromSortedChanges,
} from '../../utils/bpmUtils';
import {
  LANE_POSITIONS,
  LANE_WIDTH,
  PIXELS_PER_SECOND,
  TAP_NOTE_HEIGHT,
  TIMELINE_BOTTOM_PADDING,
} from './constants';

const CONTENT_WIDTH = LANE_WIDTH * 4;
const NOTE_WIDTH = LANE_WIDTH - 4;
const MAX_DPR = 1.25;
const MEASURE_LABEL_FONT = '700 11px sans-serif';

export interface PlaybackNoteIndex {
  sorted: readonly Note[];
  byLane: readonly (readonly Note[])[];
}

interface ChartEditorPlaybackCanvasProps {
  active: boolean;
  noteIndex: PlaybackNoteIndex;
  bpm: number;
  bpmChanges: readonly BPMChange[];
  speedChanges: readonly SpeedChange[];
  bgaVisibilityIntervals: readonly BgaVisibilityInterval[];
  lanePositionIntervals: readonly LanePositionInterval[];
  currentTimeRef?: React.MutableRefObject<number>;
  selectedNoteIds: ReadonlySet<number>;
  zoom: number;
  gridDivision: number;
  beatsPerMeasure: number;
  timeSignatureOffset: number;
  timelineContentHeight: number;
  timelineScrollRef: React.RefObject<HTMLDivElement>;
}

const lowerBoundNoteTime = (notes: readonly Note[], target: number): number => {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time < target) low = mid + 1;
    else high = mid;
  }
  return low;
};

const upperBoundNoteTime = (notes: readonly Note[], target: number): number => {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time <= target) low = mid + 1;
    else high = mid;
  }
  return low;
};

const lowerBoundStartTime = <T extends { startTimeMs: number }>(
  events: readonly T[],
  target: number
): number => {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (events[mid].startTimeMs < target) low = mid + 1;
    else high = mid;
  }
  return low;
};

const lowerBoundNumber = (values: readonly number[], target: number): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
};

const getNoteEndTime = (note: Note): number =>
  note.endTime ?? note.time + Math.max(0, note.duration ?? 0);

const drawNote = (
  context: CanvasRenderingContext2D,
  note: Note,
  laneLeft: number,
  scrollTop: number,
  timelineContentHeight: number,
  zoom: number,
  selected: boolean
) => {
  const pixelsPerMs = (PIXELS_PER_SECOND * zoom) / 1000;
  const viewportBaseY = timelineContentHeight - TIMELINE_BOTTOM_PADDING - scrollTop;
  const startY = viewportBaseY - note.time * pixelsPerMs;
  const isHold = note.type === 'hold' || note.duration > 0;
  const endY = isHold ? viewportBaseY - getNoteEndTime(note) * pixelsPerMs : startY;
  const top = Math.min(startY, endY) - TAP_NOTE_HEIGHT / 2;
  const height = isHold
    ? Math.max(TAP_NOTE_HEIGHT, Math.abs(endY - startY) + TAP_NOTE_HEIGHT)
    : TAP_NOTE_HEIGHT;
  const left = laneLeft + LANE_POSITIONS[note.lane] - NOTE_WIDTH / 2;
  const warmLane = note.lane === 0 || note.lane === 2;

  context.fillStyle = isHold
    ? warmLane ? 'rgba(250, 204, 21, 0.82)' : 'rgba(45, 212, 191, 0.78)'
    : warmLane ? '#ff7b72' : '#4ecdc4';
  context.fillRect(left, top, NOTE_WIDTH, height);

  context.strokeStyle = selected
    ? '#60a5fa'
    : warmLane ? 'rgba(254, 202, 202, 0.9)' : 'rgba(153, 246, 228, 0.9)';
  context.lineWidth = selected ? 3 : 2;
  context.strokeRect(left + 1, top + 1, NOTE_WIDTH - 2, Math.max(1, height - 2));
};

export const ChartEditorPlaybackCanvas = React.memo(({
  active,
  noteIndex,
  bpm,
  bpmChanges,
  speedChanges,
  bgaVisibilityIntervals,
  lanePositionIntervals,
  currentTimeRef,
  selectedNoteIds,
  zoom,
  gridDivision,
  beatsPerMeasure,
  timeSignatureOffset,
  timelineContentHeight,
  timelineScrollRef,
}: ChartEditorPlaybackCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  const renderIndex = useMemo(() => {
    const sortedBpmChanges = [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);
    const bpmMarkerTimes = sortedBpmChanges.map((change) =>
      beatIndexToTimeFromSortedChanges(change.beatIndex, bpm, sortedBpmChanges) + timeSignatureOffset
    );
    const sortedSpeedChanges = [...speedChanges].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const sortedBgaIntervals = [...bgaVisibilityIntervals].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const sortedLaneIntervals = [...lanePositionIntervals].sort((a, b) => a.startTimeMs - b.startTimeMs);

    return {
      sortedBpmChanges,
      bpmMarkerTimes,
      sortedSpeedChanges,
      sortedBgaIntervals,
      sortedLaneIntervals,
    };
  }, [bpm, bpmChanges, speedChanges, bgaVisibilityIntervals, lanePositionIntervals, timeSignatureOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = timelineScrollRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
      const previous = sizeRef.current;
      if (previous.width === width && previous.height === height && previous.dpr === dpr) return;

      sizeRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [timelineScrollRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    if (!active) {
      const { width, height, dpr } = sizeRef.current;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      return;
    }

    let frameId = 0;
    let renderedMeasure = -1;
    let renderedMeasureLabel = '';
    const render = () => {
      const container = timelineScrollRef.current;
      const { width, height, dpr } = sizeRef.current;
      if (!container || width <= 0 || height <= 0) {
        frameId = requestAnimationFrame(render);
        return;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const scrollTop = container.scrollTop;
      const bufferPx = height * 0.75;
      const paddedTop = Math.max(0, scrollTop - bufferPx);
      const paddedBottom = scrollTop + height + bufferPx;
      const pixelsPerMs = (PIXELS_PER_SECOND * zoom) / 1000;
      const contentBaseY = timelineContentHeight - TIMELINE_BOTTOM_PADDING;
      const viewportBaseY = contentBaseY - scrollTop;
      const visibleStartMs = Math.max(0, (contentBaseY - paddedBottom) / pixelsPerMs);
      const visibleEndMs = Math.max(visibleStartMs, (contentBaseY - paddedTop) / pixelsPerMs);
      const laneLeft = (width - CONTENT_WIDTH) / 2;

      // Grid: calculate only the visible beat range from the pre-sorted BPM index.
      const safeDivision = Math.max(1, gridDivision);
      const beatStep = 1 / safeDivision;
      const gridStartTime = Math.max(0, visibleStartMs - timeSignatureOffset);
      let beatIndex = Math.max(
        0,
        Math.floor(
          timeToBeatIndexFromSortedChanges(gridStartTime, bpm, renderIndex.sortedBpmChanges) /
          beatStep
        ) * beatStep - beatStep
      );

      for (let guard = 0; guard < 4096; guard++, beatIndex += beatStep) {
        const beatTime = beatIndexToTimeFromSortedChanges(beatIndex, bpm, renderIndex.sortedBpmChanges) + timeSignatureOffset;
        if (beatTime > visibleEndMs) break;
        if (beatTime < visibleStartMs) continue;

        const measureRatio = beatIndex / Math.max(1, beatsPerMeasure);
        const isMeasure = Math.abs(measureRatio - Math.round(measureRatio)) < 0.000001;
        if (!isMeasure) {
          const nextBeatTime = beatIndexToTimeFromSortedChanges(
            beatIndex + beatStep,
            bpm,
            renderIndex.sortedBpmChanges
          ) + timeSignatureOffset;
          if ((nextBeatTime - beatTime) * pixelsPerMs < 3) continue;
        }

        const y = viewportBaseY - beatTime * pixelsPerMs;
        context.fillStyle = isMeasure
          ? 'rgba(56, 189, 248, 0.58)'
          : 'rgba(148, 163, 184, 0.26)';
        context.fillRect(laneLeft, Math.round(y), CONTENT_WIDTH, isMeasure ? 2 : 1);
      }

      // BPM and speed changes are point markers indexed once when data changes.
      let markerIndex = lowerBoundNumber(renderIndex.bpmMarkerTimes, visibleStartMs);
      while (markerIndex < renderIndex.bpmMarkerTimes.length) {
        const markerTime = renderIndex.bpmMarkerTimes[markerIndex++];
        if (markerTime > visibleEndMs) break;
        context.fillStyle = 'rgba(250, 204, 21, 0.9)';
        context.fillRect(laneLeft, Math.round(viewportBaseY - markerTime * pixelsPerMs), CONTENT_WIDTH, 2);
      }

      let speedIndex = lowerBoundStartTime(renderIndex.sortedSpeedChanges, visibleStartMs);
      while (speedIndex < renderIndex.sortedSpeedChanges.length) {
        const change = renderIndex.sortedSpeedChanges[speedIndex++];
        if (change.startTimeMs > visibleEndMs) break;
        context.fillStyle = 'rgba(56, 189, 248, 0.88)';
        context.fillRect(laneLeft, Math.round(viewportBaseY - change.startTimeMs * pixelsPerMs), CONTENT_WIDTH, 2);
      }

      // BGA and lane-position intervals are canonical non-overlapping sequences.
      let bgaIndex = Math.max(0, lowerBoundStartTime(renderIndex.sortedBgaIntervals, visibleStartMs) - 1);
      while (bgaIndex < renderIndex.sortedBgaIntervals.length) {
        const interval = renderIndex.sortedBgaIntervals[bgaIndex++];
        if (interval.startTimeMs > visibleEndMs) break;
        if (interval.endTimeMs < visibleStartMs) continue;
        const startY = viewportBaseY - interval.startTimeMs * pixelsPerMs;
        const endY = viewportBaseY - interval.endTimeMs * pixelsPerMs;
        const top = Math.min(startY, endY);
        const intervalHeight = Math.max(2, Math.abs(endY - startY));
        context.fillStyle = 'rgba(248, 113, 113, 0.2)';
        context.fillRect(laneLeft, top, CONTENT_WIDTH, intervalHeight);
        context.strokeStyle = 'rgba(248, 113, 113, 0.7)';
        context.lineWidth = 1;
        context.strokeRect(laneLeft, top, CONTENT_WIDTH, intervalHeight);
      }

      let laneIntervalIndex = Math.max(
        0,
        lowerBoundStartTime(renderIndex.sortedLaneIntervals, visibleStartMs) - 1
      );
      while (laneIntervalIndex < renderIndex.sortedLaneIntervals.length) {
        const interval = renderIndex.sortedLaneIntervals[laneIntervalIndex++];
        if (interval.startTimeMs > visibleEndMs) break;
        if (interval.endTimeMs < visibleStartMs) continue;
        const startY = viewportBaseY - interval.startTimeMs * pixelsPerMs;
        const endY = viewportBaseY - interval.endTimeMs * pixelsPerMs;
        const top = Math.min(startY, endY);
        const intervalHeight = Math.max(2, Math.abs(endY - startY));
        context.fillStyle = interval.offsetX < 0
          ? 'rgba(34, 211, 238, 0.72)'
          : interval.offsetX > 0
            ? 'rgba(168, 85, 247, 0.72)'
            : 'rgba(148, 163, 184, 0.72)';
        context.fillRect(laneLeft + 8, top, 12, intervalHeight);
      }

      // Tap candidates use a binary time range. One predecessor per lane covers
      // holds that started before the viewport and still intersect it.
      for (const laneNotes of noteIndex.byLane) {
        const predecessorIndex = lowerBoundNoteTime(laneNotes, visibleStartMs) - 1;
        if (predecessorIndex < 0) continue;
        const note = laneNotes[predecessorIndex];
        if (getNoteEndTime(note) >= visibleStartMs) {
          drawNote(
            context,
            note,
            laneLeft,
            scrollTop,
            timelineContentHeight,
            zoom,
            selectedNoteIds.has(note.id)
          );
        }
      }

      const noteStart = lowerBoundNoteTime(noteIndex.sorted, visibleStartMs);
      const noteEnd = upperBoundNoteTime(noteIndex.sorted, visibleEndMs);
      for (let index = noteStart; index < noteEnd; index++) {
        const note = noteIndex.sorted[index];
        drawNote(
          context,
          note,
          laneLeft,
          scrollTop,
          timelineContentHeight,
          zoom,
          selectedNoteIds.has(note.id)
        );
      }

      const playheadTime = currentTimeRef?.current ?? 0;
      const playheadY = viewportBaseY - playheadTime * pixelsPerMs;
      context.fillStyle = '#ff4d21';
      context.fillRect(laneLeft, Math.round(playheadY) - 1, CONTENT_WIDTH, 3);

      const currentBeatIndex = timeToBeatIndexFromSortedChanges(
        playheadTime,
        bpm,
        renderIndex.sortedBpmChanges
      );
      const currentMeasure = Math.floor(currentBeatIndex / Math.max(1, beatsPerMeasure)) + 1;
      if (currentMeasure !== renderedMeasure) {
        renderedMeasure = currentMeasure;
        renderedMeasureLabel = `${currentMeasure}마디`;
      }
      context.font = MEASURE_LABEL_FONT;
      context.textBaseline = 'middle';
      context.fillStyle = '#ff3b3b';
      context.fillText(
        renderedMeasureLabel,
        laneLeft + CONTENT_WIDTH + 8,
        Math.round(playheadY)
      );

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [
    active,
    beatsPerMeasure,
    bpm,
    currentTimeRef,
    gridDivision,
    noteIndex,
    renderIndex,
    selectedNoteIds,
    timeSignatureOffset,
    timelineContentHeight,
    timelineScrollRef,
    zoom,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        display: active ? 'block' : 'none',
        pointerEvents: 'none',
        zIndex: 1300,
      }}
    />
  );
});
