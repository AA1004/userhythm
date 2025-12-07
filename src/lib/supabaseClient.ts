import { api } from './api';

// 로컬 개발: VITE_API_BASE가 비어있으면 Vite 프록시 사용 (빈 문자열 → /api/... 요청)
// 프로덕션: 반드시 VITE_API_BASE 설정 필요 (예: https://api.userhythm.kr)
const API_BASE = import.meta.env.VITE_API_BASE || '';

export type User = {
  id: string;
  email?: string;
  role?: string;
  profile?: any;
};

export const isSupabaseConfigured = true;

// supabase 대체: auth 관련 최소 구현
export const supabase = {
  auth: {
    async getSession() {
      try {
        const res = await api.me();
        const user = res.user
          ? {
              id: res.user.id,
              email: res.user.email,
              role: res.user.role,
              profile: res.user.profile,
            }
          : null;
        return { data: { session: user ? { user } : null }, error: null };
      } catch (error: any) {
        return { data: { session: null }, error };
      }
    },
    async signInWithOAuth(_opts: { provider: 'google'; options?: { redirectTo?: string } }) {
      const redirect = _opts.options?.redirectTo || window.location.origin;
      const url = `${API_BASE}/api/auth/google/start?redirect=${encodeURIComponent(redirect)}`;
      window.location.href = url;
      return { data: null, error: null };
    },
    async signOut() {
      try {
        await api.logout();
        return { error: null };
      } catch (error: any) {
        return { error };
      }
    },
    onAuthStateChange(callback: (event: string, session: { user: User | null } | null) => void) {
      let active = true;
      // 초기 한 번 현재 세션 동기화
      (async () => {
        try {
          const res = await api.me();
          if (!active) return;
          const user = res.user
            ? {
                id: res.user.id,
                email: res.user.email,
                role: res.user.role,
                profile: res.user.profile,
              }
            : null;
          callback('INITIAL_SESSION', user ? { user } : null);
        } catch (error) {
          if (!active) return;
          console.error('onAuthStateChange fetch failed:', error);
          callback('INITIAL_SESSION', null);
        }
      })();

      const subscription = {
        unsubscribe() {
          active = false;
        },
      };

      return { data: { subscription }, error: null };
    },
  },
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
  created_at?: string;
  updated_at?: string;
  status?: 'pending' | 'approved' | 'rejected';
  play_count?: number;
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
  async uploadChart(_chartData: any) {
    throw new Error('업로드는 새 백엔드에 아직 구현되지 않았습니다.');
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
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 12;
    const offset = Math.max(0, (page - 1) * limit);
    const { charts, total } = await api.getCharts({
      search: options?.search,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder,
      limit,
      offset,
    });
    const hasMore = charts.length === limit && page * limit < (total || 0);
    return { items: charts, total, hasMore, page, limit };
  },

  // Get pending charts (for admin)
  async getPendingCharts() {
    const res = await api.getPendingCharts();
    return res.charts;
  },

  // Get a single chart by ID
  async getChartById(id: string) {
    const res = await api.getChartById(id);
    return res.chart;
  },

  // Update chart status (admin only)
  async updateChartStatus(chartId: string, status: 'approved' | 'rejected', _comment?: string) {
    return api.updateChartStatus(chartId, status, _comment);
  },

  // Increment play count
  async incrementPlayCount(_chartId: string) {
    // 아직 미구현 (백엔드에 엔드포인트 추가 필요)
    return;
  },

  // Upload preview image
  async uploadPreviewImage(_chartId: string, _file: File) {
    throw new Error('미구현');
  },
};

// Profile API functions
export const profileAPI = {
  // Get or create user profile
  async getOrCreateProfile(userId: string): Promise<UserProfile> {
    const res = await api.me();
    if (!res.user) throw new Error('user not found');
    const p = res.user.profile || {};
    return {
      id: p.id || userId,
      display_name: p.nickname || p.display_name || res.user.email || null,
      role: p.role || res.user.role || 'user',
      nickname_updated_at: p.nickname_updatedAt || p.nickname_updated_at || null,
      created_at: p.createdAt || p.created_at || '',
      updated_at: p.updatedAt || p.updated_at || '',
    };
  },

  // Update display name (with weekly restriction check)
  async updateDisplayName(_userId: string, displayName: string): Promise<{ success: boolean; nextChangeAt?: Date }> {
    const res = await api.updateDisplayName(displayName);
    if (res.success) return { success: true };
    if (res.nextChangeAt) return { success: false, nextChangeAt: new Date(res.nextChangeAt) };
    return { success: false };
  },

  // Get user profile
  async getProfile(userId: string): Promise<UserProfile | null> {
    const res = await api.me();
    if (!res.user || !res.user.profile) return null;
    const p = res.user.profile;
    return {
      id: p.id || userId,
      display_name: p.nickname || p.display_name || res.user.email || null,
      role: p.role || res.user.role || 'user',
      nickname_updated_at: p.nickname_updatedAt || p.nickname_updated_at || null,
      created_at: p.createdAt || p.created_at || '',
      updated_at: p.updatedAt || p.updated_at || '',
    };
  },
};
