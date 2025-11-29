import { supabase, isSupabaseConfigured } from './supabaseClient';
import { SubtitleCue, SubtitleCueCreate, SubtitleCueUpdate, DEFAULT_SUBTITLE_STYLE } from '../types/subtitle';

const missingConfigError = new Error(
  'Supabase 환경 변수가 설정되지 않았습니다. 자막 기능을 사용하려면 .env 파일을 구성하세요.'
);

const ensureConfigured = () => {
  if (!isSupabaseConfigured) {
    throw missingConfigError;
  }
};

/**
 * Supabase에서 가져온 row를 SubtitleCue로 변환
 */
const rowToSubtitleCue = (row: any): SubtitleCue => {
  let style = DEFAULT_SUBTITLE_STYLE;
  
  try {
    if (row.style) {
      style = typeof row.style === 'string' ? JSON.parse(row.style) : row.style;
    }
  } catch (e) {
    console.warn('Failed to parse subtitle style:', e);
  }

  return {
    id: row.id,
    chartId: row.chart_id,
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
    row.style = JSON.stringify(cue.style);
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
    ensureConfigured();

    const { data, error } = await supabase
      .from('subtitles')
      .select('*')
      .eq('chart_id', chartId)
      .order('start_time_ms', { ascending: true });

    if (error) {
      console.error('Failed to fetch subtitles:', error);
      throw error;
    }

    return (data || []).map(rowToSubtitleCue);
  },

  /**
   * 자막 생성
   */
  async createSubtitle(cue: SubtitleCueCreate): Promise<SubtitleCue> {
    ensureConfigured();

    const row = subtitleCueToRow(cue);
    row.created_at = new Date().toISOString();
    row.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('subtitles')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('Failed to create subtitle:', error);
      throw error;
    }

    return rowToSubtitleCue(data);
  },

  /**
   * 자막 업데이트
   */
  async updateSubtitle(id: string, updates: SubtitleCueUpdate): Promise<SubtitleCue> {
    ensureConfigured();

    const row = subtitleCueToRow(updates);
    row.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('subtitles')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update subtitle:', error);
      throw error;
    }

    return rowToSubtitleCue(data);
  },

  /**
   * 자막 삭제
   */
  async deleteSubtitle(id: string): Promise<void> {
    ensureConfigured();

    const { error } = await supabase
      .from('subtitles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete subtitle:', error);
      throw error;
    }
  },

  /**
   * 특정 채보의 모든 자막 삭제
   */
  async deleteAllSubtitlesByChartId(chartId: string): Promise<void> {
    ensureConfigured();

    const { error } = await supabase
      .from('subtitles')
      .delete()
      .eq('chart_id', chartId);

    if (error) {
      console.error('Failed to delete all subtitles:', error);
      throw error;
    }
  },

  /**
   * 여러 자막 일괄 업데이트 (upsert)
   */
  async upsertSubtitles(chartId: string, cues: SubtitleCue[]): Promise<SubtitleCue[]> {
    ensureConfigured();

    const rows = cues.map((cue) => {
      const row = subtitleCueToRow(cue, chartId);
      row.id = cue.id;
      row.updated_at = new Date().toISOString();
      if (!cue.createdAt) {
        row.created_at = new Date().toISOString();
      }
      return row;
    });

    const { data, error } = await supabase
      .from('subtitles')
      .upsert(rows, { onConflict: 'id' })
      .select();

    if (error) {
      console.error('Failed to upsert subtitles:', error);
      throw error;
    }

    return (data || []).map(rowToSubtitleCue);
  },

  /**
   * 특정 채보의 자막 개수 조회
   */
  async getSubtitleCount(chartId: string): Promise<number> {
    ensureConfigured();

    const { count, error } = await supabase
      .from('subtitles')
      .select('*', { count: 'exact', head: true })
      .eq('chart_id', chartId);

    if (error) {
      console.error('Failed to get subtitle count:', error);
      throw error;
    }

    return count || 0;
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

