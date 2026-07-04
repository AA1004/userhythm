import { createHash } from 'crypto';

export const MAX_DATA_JSON_LENGTH = 1_000_000;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_DIFFICULTY_LENGTH = 50;

const MAX_NOTES = 20_000;
const MAX_CHART_TIME_MS = 2 * 60 * 60 * 1000;
const MAX_BGA_INTERVALS = 1_000;
const MAX_SUBTITLES = 2_000;
const MAX_SUBTITLE_TRACKS = 50;
const MAX_SUBTITLE_TEXT_LENGTH = 1_000;
const MAX_TOTAL_SUBTITLE_TEXT_LENGTH = 250_000;
const MAX_FADE_MS = 60_000;
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export interface ChartNote {
  id: number;
  lane: 0 | 1 | 2 | 3;
  time: number;
  duration: number;
  endTime: number;
  type: 'tap' | 'hold';
  y: number;
  hit: boolean;
}

export interface ValidatedChartData {
  chartData: Record<string, unknown> & { notes: ChartNote[]; bpm: number };
  dataJson: string;
  expectedJudgments: number;
  chartHash: string;
  adminDifficulty: string | null;
}

export type ChartDataValidationResult =
  | ({ ok: true } & ValidatedChartData)
  | { ok: false; error: string };

export interface ChartDataValidationOptions {
  allowAdminDifficulty?: boolean;
  routeBpm?: number;
  routeYoutubeUrl?: string | null;
}

const fail = (error: string): ChartDataValidationResult => ({ ok: false, error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown): number | null => {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
};

const isSaneBpm = (value: number): boolean => value > 0 && value <= 999;

const isSaneTime = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= MAX_CHART_TIME_MS;

const toLane = (value: unknown): 0 | 1 | 2 | 3 | null => {
  const lane = toFiniteNumber(value);
  if (lane === null || !Number.isInteger(lane) || lane < 0 || lane > 3) return null;
  return lane as 0 | 1 | 2 | 3;
};

export const getExpectedJudgmentCount = (notes: readonly ChartNote[]): number =>
  notes.reduce((total, note) => total + (note.type === 'hold' && note.duration > 0 ? 2 : 1), 0);

const normalizeNote = (value: unknown, index: number): ChartNote | { error: string } => {
  if (!isRecord(value)) return { error: 'invalid_note' };

  const lane = toLane(value.lane);
  if (lane === null) return { error: 'invalid_note_lane' };

  const time = toFiniteNumber(value.time);
  if (time === null || !isSaneTime(time)) return { error: 'invalid_note_time' };

  const rawDuration = value.duration === undefined ? 0 : toFiniteNumber(value.duration);
  if (rawDuration === null || rawDuration < 0 || rawDuration > MAX_CHART_TIME_MS) {
    return { error: 'invalid_note_duration' };
  }

  const rawEndTime = value.endTime === undefined ? null : toFiniteNumber(value.endTime);
  if (rawEndTime !== null && !isSaneTime(rawEndTime)) return { error: 'invalid_note_endTime' };
  if (value.endTime !== undefined && rawEndTime === null) return { error: 'invalid_note_endTime' };

  const declaredType = value.type;
  const hasValidType = declaredType === 'tap' || declaredType === 'hold' || declaredType === undefined;
  if (!hasValidType) {
    const canNormalize = rawDuration > 0 || (rawEndTime !== null && rawEndTime > time);
    if (!canNormalize) {
      return { error: 'invalid_note_type' };
    }
  }

  let duration = rawDuration;
  if (duration === 0 && rawEndTime !== null && rawEndTime > time) {
    duration = rawEndTime - time;
  }
  if (duration < 0 || duration > MAX_CHART_TIME_MS || time + duration > MAX_CHART_TIME_MS) {
    return { error: 'invalid_note_duration' };
  }

  const isHold = declaredType === 'hold' || duration > 0;
  if (!isHold) {
    return {
      id: index + 1,
      lane,
      time,
      duration: 0,
      endTime: time,
      type: 'tap',
      y: 0,
      hit: false,
    };
  }

  if (duration <= 0) {
    return {
      id: index + 1,
      lane,
      time,
      duration: 0,
      endTime: time,
      type: 'tap',
      y: 0,
      hit: false,
    };
  }

  return {
    id: index + 1,
    lane,
    time,
    duration,
    endTime: time + duration,
    type: 'hold',
    y: 0,
    hit: false,
  };
};

const normalizeNotes = (value: unknown): ChartNote[] | { error: string } => {
  if (!Array.isArray(value)) return { error: 'invalid_chart_notes' };
  if (value.length > MAX_NOTES) return { error: 'too_many_notes' };

  const normalized: Array<{ note: ChartNote; originalIndex: number }> = [];
  for (let index = 0; index < value.length; index += 1) {
    const note = normalizeNote(value[index], index);
    if ('error' in note) return note;
    normalized.push({ note, originalIndex: index });
  }

  return normalized
    .sort((left, right) => left.note.time - right.note.time || left.originalIndex - right.originalIndex)
    .map(({ note }, index) => ({ ...note, id: index + 1 }));
};

export const extractYouTubeVideoId = (input: string): string | null => {
  const trimmed = input.trim();
  if (YOUTUBE_VIDEO_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isYouTubeHost =
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com');

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] || '';
    return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
  }

  if (!isYouTubeHost) return null;

  const watchId = url.searchParams.get('v');
  if (watchId && YOUTUBE_VIDEO_ID_RE.test(watchId)) return watchId;

  const [, route, id] = url.pathname.split('/');
  if ((route === 'embed' || route === 'shorts') && id && YOUTUBE_VIDEO_ID_RE.test(id)) {
    return id;
  }

  return null;
};

const normalizeYouTubeFields = (
  chart: Record<string, unknown>,
  routeYoutubeUrl?: string | null
): { videoId: string | null } | { error: string } => {
  const ids = new Set<string>();

  const chartVideoId = typeof chart.youtubeVideoId === 'string' ? chart.youtubeVideoId.trim() : '';
  if (chart.youtubeVideoId !== undefined && chartVideoId.length === 0) {
    delete chart.youtubeVideoId;
  } else if (chartVideoId.length > 0) {
    if (!YOUTUBE_VIDEO_ID_RE.test(chartVideoId)) return { error: 'invalid_youtube_video_id' };
    ids.add(chartVideoId);
  }

  const urlCandidates = [
    typeof chart.youtubeUrl === 'string' ? chart.youtubeUrl.trim() : '',
    typeof routeYoutubeUrl === 'string' ? routeYoutubeUrl.trim() : '',
  ].filter((value) => value.length > 0);

  for (const candidate of urlCandidates) {
    const id = extractYouTubeVideoId(candidate);
    if (!id) return { error: 'invalid_youtube_url' };
    ids.add(id);
  }

  if (ids.size > 1) return { error: 'youtube_video_mismatch' };
  const [videoId] = Array.from(ids);

  if (typeof routeYoutubeUrl === 'string' && routeYoutubeUrl.trim().length > 0) {
    chart.youtubeUrl = routeYoutubeUrl.trim();
  } else if (typeof chart.youtubeUrl === 'string') {
    chart.youtubeUrl = chart.youtubeUrl.trim();
  } else if (chart.youtubeUrl !== undefined) {
    return { error: 'invalid_youtube_url' };
  }

  if (videoId) {
    chart.youtubeVideoId = videoId;
  }

  return { videoId: videoId ?? null };
};

const normalizeBgaVisibilityIntervals = (chart: Record<string, unknown>): string | null => {
  if (chart.bgaVisibilityIntervals === undefined) return null;
  if (!Array.isArray(chart.bgaVisibilityIntervals)) return 'invalid_bga_intervals';
  if (chart.bgaVisibilityIntervals.length > MAX_BGA_INTERVALS) return 'too_many_bga_intervals';

  const normalized = chart.bgaVisibilityIntervals.map((value, index) => {
    if (!isRecord(value)) return null;
    const startTimeMs = toFiniteNumber(value.startTimeMs);
    const endTimeMs = value.endTimeMs === undefined ? startTimeMs : toFiniteNumber(value.endTimeMs);
    if (startTimeMs === null || endTimeMs === null) return null;
    if (!isSaneTime(startTimeMs) || !isSaneTime(endTimeMs) || endTimeMs < startTimeMs) return null;
    const fadeInMs = value.fadeInMs === undefined ? 0 : toFiniteNumber(value.fadeInMs);
    const fadeOutMs = value.fadeOutMs === undefined ? 0 : toFiniteNumber(value.fadeOutMs);
    if (
      fadeInMs === null ||
      fadeOutMs === null ||
      fadeInMs < 0 ||
      fadeOutMs < 0 ||
      fadeInMs > MAX_FADE_MS ||
      fadeOutMs > MAX_FADE_MS
    ) {
      return null;
    }
    return {
      ...value,
      id: typeof value.id === 'string' && value.id.length > 0 ? value.id.slice(0, 100) : `bga-${index}`,
      startTimeMs,
      endTimeMs,
      mode: value.mode === 'visible' ? 'visible' : 'hidden',
      fadeInMs,
      fadeOutMs,
      easing: value.easing === 'linear' ? 'linear' : undefined,
    };
  });

  if (normalized.some((value) => value === null)) return 'invalid_bga_interval';
  chart.bgaVisibilityIntervals = normalized;
  return null;
};

const normalizeSubtitles = (chart: Record<string, unknown>): string | null => {
  if (chart.subtitleTracks !== undefined) {
    if (!Array.isArray(chart.subtitleTracks)) return 'invalid_subtitle_tracks';
    if (chart.subtitleTracks.length > MAX_SUBTITLE_TRACKS) return 'too_many_subtitle_tracks';
    chart.subtitleTracks = chart.subtitleTracks.map((track, index) => {
      if (!isRecord(track)) return { id: `track-${index + 1}`, name: `Track ${index + 1}` };
      return {
        ...track,
        id: typeof track.id === 'string' && track.id.length > 0 ? track.id.slice(0, 100) : `track-${index + 1}`,
        name: typeof track.name === 'string' && track.name.length > 0 ? track.name.slice(0, 120) : `Track ${index + 1}`,
      };
    });
  }

  if (chart.subtitles === undefined) return null;
  if (!Array.isArray(chart.subtitles)) return 'invalid_subtitles';
  if (chart.subtitles.length > MAX_SUBTITLES) return 'too_many_subtitles';

  let totalTextLength = 0;
  const normalized = chart.subtitles.map((value, index) => {
    if (!isRecord(value)) return null;
    const startTimeMs = toFiniteNumber(value.startTimeMs ?? value.startTime);
    const endTimeMs = toFiniteNumber(value.endTimeMs ?? value.endTime);
    if (startTimeMs === null || endTimeMs === null) return null;
    if (!isSaneTime(startTimeMs) || !isSaneTime(endTimeMs) || endTimeMs < startTimeMs) return null;
    const text = typeof value.text === 'string' ? value.text : '';
    if (text.length > MAX_SUBTITLE_TEXT_LENGTH) return null;
    totalTextLength += text.length;
    if (totalTextLength > MAX_TOTAL_SUBTITLE_TEXT_LENGTH) return null;
    return {
      ...value,
      id: typeof value.id === 'string' && value.id.length > 0 ? value.id.slice(0, 100) : `subtitle-${index}`,
      startTimeMs,
      endTimeMs,
      text,
    };
  });

  if (normalized.some((value) => value === null)) return 'invalid_subtitle';
  chart.subtitles = normalized;
  return null;
};

const getChartRoot = (parsed: unknown): unknown =>
  isRecord(parsed) && isRecord(parsed.chart) ? parsed.chart : parsed;

export const computeChartHash = (chartData: Record<string, unknown>): string => {
  const gameplayData = {
    notes: chartData.notes,
    bpm: chartData.bpm,
    beatsPerMeasure: chartData.beatsPerMeasure ?? 4,
    timeSignatureOffset: chartData.timeSignatureOffset ?? 0,
    speedChanges: Array.isArray(chartData.speedChanges) ? chartData.speedChanges : [],
  };
  return createHash('sha256').update(JSON.stringify(gameplayData)).digest('hex');
};

export const validateChartDataJson = (
  raw: string,
  options: ChartDataValidationOptions = {}
): ChartDataValidationResult => {
  if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > MAX_DATA_JSON_LENGTH) {
    return fail('invalid_dataJson');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('invalid_chart_json');
  }

  const root = getChartRoot(parsed);
  if (!isRecord(root)) return fail('invalid_chart_data');

  const chart: Record<string, unknown> = { ...root };
  const notes = normalizeNotes(chart.notes);
  if ('error' in notes) return fail(notes.error);
  chart.notes = notes;

  const bpm = options.routeBpm ?? toFiniteNumber(chart.bpm);
  if (bpm === null || !isSaneBpm(bpm)) return fail('invalid_bpm');
  chart.bpm = bpm;

  const youtubeResult = normalizeYouTubeFields(chart, options.routeYoutubeUrl);
  if ('error' in youtubeResult) return fail(youtubeResult.error);

  const bgaError = normalizeBgaVisibilityIntervals(chart);
  if (bgaError) return fail(bgaError);

  const subtitleError = normalizeSubtitles(chart);
  if (subtitleError) return fail(subtitleError);

  let adminDifficulty: string | null = null;
  if (typeof chart.adminDifficulty === 'string' && chart.adminDifficulty.trim().length > 0) {
    adminDifficulty = chart.adminDifficulty.trim().slice(0, MAX_DIFFICULTY_LENGTH);
    if (options.allowAdminDifficulty) {
      chart.adminDifficulty = adminDifficulty;
    } else {
      delete chart.adminDifficulty;
      adminDifficulty = null;
    }
  } else {
    delete chart.adminDifficulty;
  }

  const dataJson = JSON.stringify(chart);
  if (dataJson.length > MAX_DATA_JSON_LENGTH) return fail('dataJson_too_large');

  return {
    ok: true,
    chartData: chart as Record<string, unknown> & { notes: ChartNote[]; bpm: number },
    dataJson,
    expectedJudgments: getExpectedJudgmentCount(notes),
    chartHash: computeChartHash(chart),
    adminDifficulty,
  };
};

export const extractAdminDifficulty = (dataJson: string): string | null => {
  try {
    const parsed = JSON.parse(dataJson || '{}');
    const root = getChartRoot(parsed);
    if (!isRecord(root)) return null;
    return typeof root.adminDifficulty === 'string' && root.adminDifficulty.trim().length > 0
      ? root.adminDifficulty.trim().slice(0, MAX_DIFFICULTY_LENGTH)
      : null;
  } catch {
    return null;
  }
};
