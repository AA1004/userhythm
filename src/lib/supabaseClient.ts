import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 환경 변수가 없으면 더미 클라이언트를 생성 (에러 방지)
// 실제로 사용할 때는 API 호출이 실패하므로, 기능은 비활성화됩니다.
const supabaseConfiguredFlag =
  !!supabaseUrl && !!supabaseAnonKey && supabaseUrl.trim() !== '' && supabaseAnonKey.trim() !== '';
export const isSupabaseConfigured = supabaseConfiguredFlag;

if (!supabaseConfiguredFlag) {
  console.warn('Supabase credentials not configured. Chart sharing features will be disabled.');
}

// 환경 변수가 없으면 더미 URL과 키로 클라이언트를 생성합니다.
// 실제 API 호출 시 에러가 발생하지만, 초기화 오류는 방지합니다.
export const supabase: SupabaseClient = createClient(
  supabaseConfiguredFlag ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseConfiguredFlag ? supabaseAnonKey : 'placeholder-anon-key'
);

const missingConfigError = new Error(
  'Supabase 환경 변수가 설정되지 않았습니다. 루트 디렉터리의 CHART_SHARING_SETUP.md를 참고해 .env 파일을 구성한 뒤 개발 서버를 재시작하세요.'
);

const ensureConfigured = () => {
  if (!supabaseConfiguredFlag) {
    throw missingConfigError;
  }
};

// Database types
export interface Chart {
  id: string;
  title: string;
  author: string;
  bpm: number;
  preview_image?: string;
  difficulty?: string;
  data_json: string; // JSON stringified chart data
  created_at: string;
  updated_at: string;
  status: 'pending' | 'approved' | 'rejected';
  play_count: number;
  youtube_url?: string;
  description?: string;
}

export interface ChartReview {
  id: string;
  chart_id: string;
  reviewer: string;
  action: 'approved' | 'rejected';
  comment?: string;
  created_at: string;
}

// Chart API functions
export const chartAPI = {
  // Upload a new chart
  // RLS INSERT 정책만 통과하면 되도록, INSERT 후 행을 다시 SELECT 하지 않습니다.
  // (Supabase v2에서는 .select()를 호출하지 않으면 최소 반환 모드로 동작합니다.)
  async uploadChart(chartData: Omit<Chart, 'id' | 'created_at' | 'updated_at' | 'status' | 'play_count'>) {
    ensureConfigured();
    const { error } = await supabase
      .from('charts')
      .insert({
        ...chartData,
        status: 'pending',
        play_count: 0,
      });

    if (error) throw error;
    // 현재 호출 측에서는 반환값을 사용하지 않으므로 따로 data를 리턴하지 않습니다.
  },

  // Get approved charts with pagination and filters
  async getApprovedCharts(options?: {
    search?: string;
    sortBy?: 'created_at' | 'play_count' | 'title';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }) {
    ensureConfigured();
    let query = supabase
      .from('charts')
      .select('*', { count: 'exact' })
      .eq('status', 'approved');

    if (options?.search) {
      query = query.or(`title.ilike.%${options.search}%,author.ilike.%${options.search}%`);
    }

    const sortBy = options?.sortBy || 'created_at';
    const sortOrder = options?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    if (options?.limit) {
      query = query.range(options.offset || 0, (options.offset || 0) + options.limit - 1);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { charts: data || [], total: count || 0 };
  },

  // Get pending charts (for admin)
  async getPendingCharts() {
    ensureConfigured();
    const { data, error } = await supabase
      .from('charts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Get a single chart by ID
  async getChartById(id: string) {
    ensureConfigured();
    const { data, error } = await supabase
      .from('charts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  // Update chart status (admin only)
  async updateChartStatus(chartId: string, status: 'approved' | 'rejected', reviewer: string, comment?: string) {
    ensureConfigured();
    // Update chart status
    const { error: chartError } = await supabase
      .from('charts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', chartId);

    if (chartError) throw chartError;

    // Log review
    const { error: reviewError } = await supabase
      .from('chart_reviews')
      .insert({
        chart_id: chartId,
        reviewer,
        action: status,
        comment,
      });

    if (reviewError) throw reviewError;
  },

  // Increment play count
  async incrementPlayCount(chartId: string) {
    if (!supabaseConfiguredFlag) {
      return;
    }
    const { error } = await supabase.rpc('increment_play_count', { chart_id: chartId });
    if (error) console.error('Failed to increment play count:', error);
  },

  // Upload preview image
  async uploadPreviewImage(chartId: string, file: File) {
    ensureConfigured();
    const fileExt = file.name.split('.').pop();
    const fileName = `${chartId}-${Date.now()}.${fileExt}`;
    const filePath = `previews/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('chart-images')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('chart-images')
      .getPublicUrl(filePath);

    return data.publicUrl;
  },
};
