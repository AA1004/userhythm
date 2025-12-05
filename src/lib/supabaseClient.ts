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

// Vite HMR 시 모듈이 재로드되면서 createClient가 중복 호출되어
// GoTrueClient 경고가 나올 수 있으므로 싱글톤으로 보관
const globalForSupabase = globalThis as unknown as { __supabaseClient?: SupabaseClient };

// 환경 변수가 없으면 더미 URL과 키로 클라이언트를 생성합니다.
// 실제 API 호출 시 에러가 발생하지만, 초기화 오류는 방지합니다.
export const supabase: SupabaseClient =
  globalForSupabase.__supabaseClient ||
  createClient(
    supabaseConfiguredFlag ? supabaseUrl : 'https://placeholder.supabase.co',
    supabaseConfiguredFlag ? supabaseAnonKey : 'placeholder-anon-key'
  );

if (!globalForSupabase.__supabaseClient) {
  globalForSupabase.__supabaseClient = supabase;
}

const missingConfigError = new Error(
  'Supabase 환경 변수가 설정되지 않았습니다. 루트 디렉터리의 CHART_SHARING_SETUP.md를 참고해 .env 파일을 구성한 뒤 개발 서버를 재시작하세요.'
);

const withTimeout = async <T>(promise: PromiseLike<T>, timeoutMs = 10000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Supabase 요청이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
};

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

// User role type
export type UserRole = 'user' | 'moderator' | 'admin';

// User profile type
export interface UserProfile {
  id: string;
  display_name: string | null;
  role: UserRole;
  nickname_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

// Chart API functions
export const chartAPI = {
  // Upload a new chart
  async uploadChart(chartData: Omit<Chart, 'id' | 'created_at' | 'updated_at' | 'status' | 'play_count'>) {
    ensureConfigured();
    // INSERT만 수행 (SELECT는 RLS 정책 때문에 pending 상태를 볼 수 없음)
    const { error } = await supabase
      .from('charts')
      .insert({
        ...chartData,
        status: 'pending',
        play_count: 0,
      });

    if (error) throw error;
    
    // INSERT 성공 시 true 반환 (실제 데이터는 SELECT 정책 때문에 반환할 수 없음)
    return true;
  },

  // 새 페이지 기반 조회 (AbortController 지원)
  async getChartsPage(options?: {
    search?: string;
    sortBy?: 'created_at' | 'play_count' | 'title';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    signal?: AbortSignal;
  }) {
    ensureConfigured();
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 12;
    const offset = Math.max(0, (page - 1) * limit);

    let query = supabase
      .from('charts')
      .select(
        'id,title,author,bpm,play_count,difficulty,preview_image,data_json,created_at,youtube_url,description',
        { count: 'planned' }
      )
      .eq('status', 'approved');

    if (options?.search) {
      query = query.or(`title.ilike.%${options.search}%,author.ilike.%${options.search}%`);
    }

    const sortBy = options?.sortBy || 'created_at';
    const sortOrder = options?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    query = query.range(offset, offset + limit - 1);

    if (options?.signal) {
      query = query.abortSignal(options.signal);
    }

    const { data, error, count } = await withTimeout<any>(query, 12000);

    if (error) {
      // AbortSignal로 취소된 경우 그대로 전파
      if ((error as any)?.name === 'AbortError') throw error;
      throw error;
    }

    const items = data || [];
    const total = typeof count === 'number' ? count : items.length + offset;
    const hasMore = items.length === limit && (total ? offset + items.length < total : true);

    return { items, total, hasMore, page, limit };
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

// Profile API functions
export const profileAPI = {
  // Get or create user profile
  async getOrCreateProfile(userId: string): Promise<UserProfile> {
    ensureConfigured();
    
    // Try to get existing profile
    const { data: existing, error: selectError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (existing) {
      return existing as UserProfile;
    }

    // Create new profile if not exists
    if (selectError?.code === 'PGRST116') {
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          display_name: null,
          role: 'user',
          nickname_updated_at: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return created as UserProfile;
    }

    throw selectError;
  },

  // Update display name (with weekly restriction check)
  async updateDisplayName(userId: string, displayName: string): Promise<{ success: boolean; nextChangeAt?: Date }> {
    ensureConfigured();
    
    // Get current profile to check last update time
    const { data: profile, error: selectError } = await supabase
      .from('profiles')
      .select('nickname_updated_at')
      .eq('id', userId)
      .single();

    if (selectError) throw selectError;

    // Check if 7 days have passed since last nickname change
    if (profile?.nickname_updated_at) {
      const lastUpdate = new Date(profile.nickname_updated_at);
      const nextAllowed = new Date(lastUpdate.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (new Date() < nextAllowed) {
        return { success: false, nextChangeAt: nextAllowed };
      }
    }

    // Update display name
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        nickname_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) throw updateError;
    return { success: true };
  },

  // Get user profile
  async getProfile(userId: string): Promise<UserProfile | null> {
    if (!supabaseConfiguredFlag) return null;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data as UserProfile;
  },
};
