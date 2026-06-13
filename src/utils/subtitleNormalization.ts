import {
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_SUBTITLE_TRACKS,
  SubtitleCue,
  SubtitleTrack,
} from '../types/subtitle';

export interface SubtitlePayload {
  chartId: string;
  subtitles: SubtitleCue[];
  subtitleTracks: SubtitleTrack[];
  selectedTrackId: string;
}

const MIN_SUBTITLE_DURATION_MS = 100;

const cloneTrack = (track: SubtitleTrack): SubtitleTrack => ({
  ...track,
  defaultStyle: track.defaultStyle ? { ...track.defaultStyle } : undefined,
});

export const buildDefaultTracksFromCues = (cues: SubtitleCue[]): SubtitleTrack[] => {
  const usedTrackIds = Array.from(
    new Set(
      cues
        .map((cue) => cue.trackId ?? cue.style?.trackId)
        .filter((trackId): trackId is string => typeof trackId === 'string' && trackId.length > 0)
    )
  );

  if (usedTrackIds.length === 0) {
    return DEFAULT_SUBTITLE_TRACKS.map(cloneTrack);
  }

  return usedTrackIds.map((trackId, index) => {
    const fallback = DEFAULT_SUBTITLE_TRACKS[0];
    return {
      id: trackId,
      name: index === 0 ? fallback.name : `트랙 ${index + 1}`,
      positionPreset: fallback.positionPreset,
      defaultStyle: {
        ...(fallback.defaultStyle ?? {}),
        trackId,
      },
    };
  });
};

export const normalizeSubtitlePayload = (
  chartId: string,
  rawSubtitles: unknown,
  rawTracks: unknown,
  preferredTrackId?: string
): SubtitlePayload => {
  const candidateSubtitles = Array.isArray(rawSubtitles) ? rawSubtitles : [];
  const candidateTracks = Array.isArray(rawTracks) ? rawTracks : [];
  const shouldBuildTracksFromCues = candidateTracks.length === 0;
  const subtitleTracks = (
    shouldBuildTracksFromCues
      ? buildDefaultTracksFromCues(candidateSubtitles as SubtitleCue[])
      : candidateTracks
  )
    .map((track: any, index): SubtitleTrack | null => {
      const id =
        typeof track?.id === 'string' && track.id.length > 0
          ? track.id
          : index === 0
            ? DEFAULT_SUBTITLE_TRACKS[0].id
            : `track-${index + 1}`;
      const fallback = DEFAULT_SUBTITLE_TRACKS[0];
      return {
        id,
        name: typeof track?.name === 'string' && track.name.length > 0 ? track.name : `트랙 ${index + 1}`,
        positionPreset:
          track?.positionPreset === 'top' || track?.positionPreset === 'middle' || track?.positionPreset === 'bottom'
            ? track.positionPreset
            : fallback.positionPreset,
        defaultStyle: {
          ...(fallback.defaultStyle ?? {}),
          ...(track?.defaultStyle ?? {}),
          trackId: id,
        },
      };
    })
    .filter((track): track is SubtitleTrack => track !== null);

  const safeTracks = subtitleTracks.length > 0 ? subtitleTracks : DEFAULT_SUBTITLE_TRACKS.map(cloneTrack);
  const validTrackIds = new Set(safeTracks.map((track) => track.id));
  const defaultTrackId = safeTracks[0].id;

  const subtitles = candidateSubtitles
    .map((cue: any, index): SubtitleCue | null => {
      const startTimeMs = Number(cue?.startTimeMs ?? cue?.startTime ?? 0);
      const endTimeMs = Number(cue?.endTimeMs ?? cue?.endTime ?? startTimeMs + 2000);
      if (!Number.isFinite(startTimeMs) || !Number.isFinite(endTimeMs)) {
        return null;
      }

      const rawTrackId = cue?.trackId ?? cue?.style?.trackId ?? defaultTrackId;
      const trackId = validTrackIds.has(rawTrackId)
        ? rawTrackId
        : shouldBuildTracksFromCues || safeTracks.length === 1
          ? defaultTrackId
          : null;
      if (!trackId || !validTrackIds.has(trackId)) {
        return null;
      }

      const safeStart = Math.max(0, startTimeMs);
      const safeEnd = Math.max(safeStart + MIN_SUBTITLE_DURATION_MS, endTimeMs);
      const style = {
        ...DEFAULT_SUBTITLE_STYLE,
        ...(cue?.style ?? {}),
        trackId,
      };

      return {
        id: typeof cue?.id === 'string' && cue.id.length > 0 ? cue.id : `subtitle-${index}`,
        chartId,
        trackId,
        startTimeMs: safeStart,
        endTimeMs: safeEnd,
        text: typeof cue?.text === 'string' ? cue.text : '',
        style,
        createdAt: cue?.createdAt,
        updatedAt: cue?.updatedAt,
      };
    })
    .filter((cue): cue is SubtitleCue => cue !== null)
    .sort((a, b) => a.startTimeMs - b.startTimeMs || a.endTimeMs - b.endTimeMs);

  const selectedTrackId =
    preferredTrackId && validTrackIds.has(preferredTrackId) ? preferredTrackId : defaultTrackId;

  return {
    chartId,
    subtitles,
    subtitleTracks: safeTracks,
    selectedTrackId,
  };
};

export const getSubtitleFontKey = (cues: SubtitleCue[]): string =>
  Array.from(new Set(cues.map((cue) => cue.style?.fontFamily || 'Noto Sans KR, sans-serif')))
    .sort()
    .join('|');
