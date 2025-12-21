import { Note, BPMChange, SpeedChange, BgaVisibilityInterval } from '../types/game';
import { validateNotes, getMaxNoteId } from './noteValidation';

/**
 * 채보 데이터 구조
 */
export interface ChartData {
  notes: Note[];
  bpm: number;
  youtubeUrl: string;
  youtubeVideoId?: string | null;
  beatsPerMeasure: number;
  timeSignatureOffset: number;
  timelineExtraMs: number;
  bpmChanges: BPMChange[];
  speedChanges: SpeedChange[];
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  chartTitle?: string;
  chartAuthor?: string;
  gridDivision?: number;
  isLongNoteMode?: boolean;
  testStartInput?: string;
  playbackSpeed?: number;
  volume?: number;
  hitSoundVolume?: number;
  currentTime?: number;
  isAutoScrollEnabled?: boolean;
  zoom?: number;
}

/**
 * 채보 데이터를 JSON 문자열로 직렬화
 */
export function serializeChart(data: ChartData): string {
  return JSON.stringify({ chart: data }, null, 2);
}

/**
 * JSON 문자열을 채보 데이터로 역직렬화
 * @returns 유효한 채보 데이터 또는 null
 */
export function deserializeChart(json: string): ChartData | null {
  try {
    const parsed = JSON.parse(json);
    const chartData = parsed.chart ?? parsed;

    if (!chartData || typeof chartData !== 'object') {
      return null;
    }

    if (!Array.isArray(chartData.notes)) {
      return null;
    }

    return chartData as ChartData;
  } catch {
    return null;
  }
}

/**
 * 채보 데이터 유효성 검증
 */
export function validateChartData(data: unknown): data is ChartData {
  if (!data || typeof data !== 'object') return false;

  const chart = data as Record<string, unknown>;

  // 필수 필드 체크
  if (!Array.isArray(chart.notes)) return false;
  if (typeof chart.bpm !== 'number') return false;

  return true;
}

/**
 * 채보 데이터 복원 및 정규화
 * - 노트 검증/정규화
 * - 기본값 적용
 */
export function restoreChartData(data: ChartData): {
  chartData: ChartData;
  maxNoteId: number;
} {
  // 노트 검증 및 정규화
  const validatedNotes = validateNotes(data.notes);
  const maxNoteId = getMaxNoteId(validatedNotes);

  const chartData: ChartData = {
    notes: validatedNotes,
    bpm: typeof data.bpm === 'number' ? data.bpm : 120,
    youtubeUrl: typeof data.youtubeUrl === 'string' ? data.youtubeUrl : '',
    youtubeVideoId: data.youtubeVideoId ?? null,
    beatsPerMeasure: typeof data.beatsPerMeasure === 'number' ? data.beatsPerMeasure : 4,
    timeSignatureOffset: data.timeSignatureOffset ?? 0,
    timelineExtraMs: typeof data.timelineExtraMs === 'number' ? data.timelineExtraMs : 0,
    bpmChanges: Array.isArray(data.bpmChanges) ? data.bpmChanges : [],
    speedChanges: Array.isArray(data.speedChanges) ? data.speedChanges : [],
    bgaVisibilityIntervals: Array.isArray(data.bgaVisibilityIntervals) ? data.bgaVisibilityIntervals : [],
    chartTitle: data.chartTitle,
    chartAuthor: data.chartAuthor,
    gridDivision: data.gridDivision,
    isLongNoteMode: data.isLongNoteMode,
    testStartInput: data.testStartInput,
    playbackSpeed: data.playbackSpeed,
    volume: data.volume,
    hitSoundVolume: data.hitSoundVolume,
    currentTime: data.currentTime,
    isAutoScrollEnabled: data.isAutoScrollEnabled,
    zoom: data.zoom,
  };

  return { chartData, maxNoteId };
}

/**
 * 채보 내보내기용 데이터 생성
 */
export function createExportData(data: ChartData): ChartData {
  return {
    notes: data.notes,
    bpm: data.bpm,
    youtubeUrl: data.youtubeUrl,
    youtubeVideoId: data.youtubeVideoId,
    beatsPerMeasure: data.beatsPerMeasure,
    timeSignatureOffset: data.timeSignatureOffset,
    timelineExtraMs: data.timelineExtraMs,
    bpmChanges: data.bpmChanges,
    speedChanges: data.speedChanges,
    bgaVisibilityIntervals: data.bgaVisibilityIntervals,
    chartTitle: data.chartTitle,
    chartAuthor: data.chartAuthor,
    gridDivision: data.gridDivision,
    isLongNoteMode: data.isLongNoteMode,
    testStartInput: data.testStartInput,
    playbackSpeed: data.playbackSpeed,
    volume: data.volume,
    hitSoundVolume: data.hitSoundVolume,
    currentTime: data.currentTime,
    isAutoScrollEnabled: data.isAutoScrollEnabled,
    zoom: data.zoom,
  };
}
