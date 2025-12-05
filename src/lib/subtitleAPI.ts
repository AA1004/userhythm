import {
  SubtitleCue,
  SubtitleCueCreate,
  SubtitleCueUpdate,
  DEFAULT_SUBTITLE_STYLE,
} from '../types/subtitle';

// 현재 Supabase 백엔드 의존성을 제거하고 로컬 스토리지만 사용합니다.
// 향후 백엔드 연동 시 이 파일을 API 호출 기반으로 교체하세요.

/**
 * Supabase에서 가져온 row를 SubtitleCue로 변환
 */
const rowToSubtitleCue = (row: any): SubtitleCue => {
  let style = DEFAULT_SUBTITLE_STYLE;

  try {
    if (row.style) {
      const parsed = typeof row.style === 'string' ? JSON.parse(row.style) : row.style;
      style = { ...DEFAULT_SUBTITLE_STYLE, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to parse subtitle style:', e);
  }

  const trackIdFromStyle = (style as any)?.trackId;
  const trackId = row.track_id ?? trackIdFromStyle ?? 'default';

  // style JSON 안에 trackId를 유지해 두 시스템이 항상 동기화되도록 함
  if (!(style as any).trackId) {
    (style as any).trackId = trackId;
  }

  return {
    id: row.id,
    chartId: row.chart_id,
    trackId,
    startTimeMs: row.start_time_ms,
    endTimeMs: row.end_time_ms,
    text: row.text || '',
    style,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * SubtitleCue를 Supabase row 형식으로 변환
 */
const subtitleCueToRow = (cue: SubtitleCueCreate | SubtitleCueUpdate, chartId?: string) => {
  const row: any = {};

  if (chartId) {
    row.chart_id = chartId;
  }
  if ('chartId' in cue && cue.chartId) {
    row.chart_id = cue.chartId;
  }
  if ('startTimeMs' in cue && cue.startTimeMs !== undefined) {
    row.start_time_ms = cue.startTimeMs;
  }
  if ('endTimeMs' in cue && cue.endTimeMs !== undefined) {
    row.end_time_ms = cue.endTimeMs;
  }
  if ('text' in cue && cue.text !== undefined) {
    row.text = cue.text;
  }
  if ('style' in cue && cue.style !== undefined) {
    const maybeTrackId =
      (cue as any).trackId !== undefined
        ? (cue as any).trackId
        : (cue as any).style?.trackId ?? 'default';

    const styleWithTrack = {
      ...(cue as any).style,
      trackId: maybeTrackId,
    };

    row.style = JSON.stringify(styleWithTrack);
  }

  return row;
};

/**
 * 자막 API
 */
export const subtitleAPI = {
  /**
   * 특정 채보의 모든 자막 가져오기
   */
  async getSubtitlesByChartId(chartId: string): Promise<SubtitleCue[]> {
    return localSubtitleStorage.get(chartId);
  },

  /**
   * 자막 생성
   */
  async createSubtitle(cue: SubtitleCueCreate): Promise<SubtitleCue> {
    const existing = localSubtitleStorage.get(cue.chartId || 'default');
    const row = subtitleCueToRow(cue);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const saved: SubtitleCue = rowToSubtitleCue({
      ...row,
      id,
      created_at: now,
      updated_at: now,
    });
    existing.push(saved);
    localSubtitleStorage.save(saved.chartId, existing);
    return saved;
  },

  /**
   * 자막 업데이트
   */
  async updateSubtitle(id: string, updates: SubtitleCueUpdate): Promise<SubtitleCue> {
    const chartId = (updates as any).chartId || 'default';
    const list = localSubtitleStorage.get(chartId);
    const now = new Date().toISOString();
    const next = list.map((cue) =>
      cue.id === id
        ? rowToSubtitleCue({
            ...subtitleCueToRow(updates, chartId),
            id,
            chart_id: chartId,
            created_at: cue.createdAt ?? now,
            updated_at: now,
          })
        : cue
    );
    localSubtitleStorage.save(chartId, next);
    const found = next.find((c) => c.id === id);
    if (!found) throw new Error('subtitle not found');
    return found;
  },

  /**
   * 자막 삭제
   */
  async deleteSubtitle(id: string): Promise<void> {
    // chartId를 모르면 모든 트랙에서 제거 시도
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('subtitles_'));
    keys.forEach((key) => {
      const chartId = key.replace('subtitles_', '');
      const list = localSubtitleStorage.get(chartId);
      const next = list.filter((cue) => cue.id !== id);
      localSubtitleStorage.save(chartId, next);
    });
  },

  /**
   * 특정 채보의 모든 자막 삭제
   */
  async deleteAllSubtitlesByChartId(chartId: string): Promise<void> {
    localSubtitleStorage.clear(chartId);
  },

  /**
   * 여러 자막 일괄 업데이트 (upsert)
   */
  async upsertSubtitles(chartId: string, cues: SubtitleCue[]): Promise<SubtitleCue[]> {
    const now = new Date().toISOString();
    const normalized = cues.map((cue) =>
      rowToSubtitleCue({
        ...subtitleCueToRow(cue, chartId),
        id: cue.id,
        chart_id: chartId,
        created_at: cue.createdAt ?? now,
        updated_at: now,
      })
    );
    localSubtitleStorage.save(chartId, normalized);
    return normalized;
  },

  /**
   * 특정 채보의 자막 개수 조회
   */
  async getSubtitleCount(chartId: string): Promise<number> {
    return localSubtitleStorage.get(chartId).length;
  },
};

/**
 * 로컬 스토리지 기반 임시 자막 저장소 (Supabase 미설정 시 사용)
 */
export const localSubtitleStorage = {
  getKey(chartId: string): string {
    return `subtitles_${chartId}`;
  },

  get(chartId: string): SubtitleCue[] {
    try {
      const key = this.getKey(chartId);
      const stored = localStorage.getItem(key);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to load local subtitles:', e);
      return [];
    }
  },

  save(chartId: string, cues: SubtitleCue[]): void {
    try {
      const key = this.getKey(chartId);
      localStorage.setItem(key, JSON.stringify(cues));
    } catch (e) {
      console.error('Failed to save local subtitles:', e);
    }
  },

  clear(chartId: string): void {
    try {
      const key = this.getKey(chartId);
      localStorage.removeItem(key);
    } catch (e) {
      console.error('Failed to clear local subtitles:', e);
    }
  },
};

