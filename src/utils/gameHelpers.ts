import { BgaVisibilityInterval, EmbeddedAudioTrack, LanePositionInterval, Note } from '../types/game';
import { SubtitleCue } from '../types/subtitle';
import { MAX_CHART_DURATION } from '../constants/gameConstants';

export interface Score {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  combo: number;
  maxCombo: number;
}

export const buildInitialScore = (): Score => ({
  perfect: 0,
  great: 0,
  good: 0,
  miss: 0,
  combo: 0,
  maxCombo: 0,
});

export interface AudioSettings {
  youtubeVideoId: string | null;
  youtubeUrl: string;
  startTimeMs: number;
  playbackSpeed: number;
  audioOffsetMs?: number;
  startDelayMs?: number;
  chartId?: string;
  overlayAudioTrack?: EmbeddedAudioTrack | null;
}

export const getAudioBaseSeconds = (audioSettings: AudioSettings | null): number => {
  if (!audioSettings) return 0;
  const { startTimeMs, audioOffsetMs = 0 } = audioSettings;
  return Math.max(0, (startTimeMs - audioOffsetMs) / 1000);
};

export const getAudioPositionSeconds = (gameTimeMs: number, audioSettings: AudioSettings | null): number => {
  if (!audioSettings) return 0;
  const { startTimeMs, audioOffsetMs = 0 } = audioSettings;
  const effectiveTime = Math.max(0, gameTimeMs);
  return Math.max(0, (startTimeMs - audioOffsetMs + effectiveTime) / 1000);
};

export interface PlayableChartDurationOptions {
  timelineExtraMs?: number;
  bgaVisibilityIntervals?: BgaVisibilityInterval[];
  lanePositionIntervals?: LanePositionInterval[];
  subtitles?: SubtitleCue[];
}

const getFiniteRangeEnd = (items: readonly { endTimeMs?: number }[] = []): number =>
  items.reduce((latest, item) => Math.max(latest, Number.isFinite(item.endTimeMs) ? item.endTimeMs! : 0), 0);

export const calculateGameDuration = (notes: Note[]): number =>
  calculatePlayableChartDuration(notes);

export const calculatePlayableChartDuration = (
  notes: Note[],
  options: PlayableChartDurationOptions = {}
): number => {
  const lastNoteTime = notes.length
    ? Math.max(
        ...notes.map((n) =>
          typeof n.endTime === 'number' ? n.endTime : n.time
        )
      )
    : 0;
  const TAIL_MARGIN_MS = 5000;
  const MIN_DURATION_MS = 60000;
  const extraMs = Number.isFinite(options.timelineExtraMs) ? Math.max(0, options.timelineExtraMs!) : 0;
  const chartContentEnd = Math.max(
    lastNoteTime + TAIL_MARGIN_MS + extraMs,
    getFiniteRangeEnd(options.bgaVisibilityIntervals),
    getFiniteRangeEnd(options.lanePositionIntervals),
    getFiniteRangeEnd(options.subtitles)
  );
  return Math.max(
    MIN_DURATION_MS,
    Math.min(chartContentEnd, MAX_CHART_DURATION)
  );
};

