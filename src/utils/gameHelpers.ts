import { Note } from '../types/game';
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
  chartId?: string;
}

export const getAudioBaseSeconds = (audioSettings: AudioSettings | null): number => {
  if (!audioSettings) return 0;
  const { startTimeMs, audioOffsetMs = 0 } = audioSettings;
  return Math.max(0, (startTimeMs + audioOffsetMs) / 1000);
};

export const getAudioPositionSeconds = (gameTimeMs: number, audioSettings: AudioSettings | null): number => {
  if (!audioSettings) return 0;
  const { startTimeMs, audioOffsetMs = 0 } = audioSettings;
  const effectiveTime = Math.max(0, gameTimeMs);
  return Math.max(0, (startTimeMs + audioOffsetMs + effectiveTime) / 1000);
};

export const calculateGameDuration = (notes: Note[]): number => {
  const lastNoteTime = notes.length
    ? Math.max(
        ...notes.map((n) =>
          typeof n.endTime === 'number' ? n.endTime : n.time
        )
      )
    : 0;
  const TAIL_MARGIN_MS = 5000; // 마지막 노트 이후 여유 시간
  const MIN_DURATION_MS = 60000; // 최소 1분
  const MAX_DURATION_MS = MAX_CHART_DURATION; // 상한은 채보 최대 길이(5분)
  const computedDuration = lastNoteTime + TAIL_MARGIN_MS;
  return Math.max(
    MIN_DURATION_MS,
    Math.min(computedDuration, MAX_DURATION_MS)
  );
};

