// 로컬 개발: VITE_API_BASE가 비어있으면 Vite 프록시 사용 (빈 문자열 → /api/... 요청)
// 프로덕션: 반드시 VITE_API_BASE 설정 필요 (예: https://api.userhythm.kr)
const API_BASE = import.meta.env.VITE_API_BASE || '';

export interface ApiChart {
  id: string;
  title: string;
  author: string;
  author_role?: string | null;
  author_nickname?: string | null;
  author_email_prefix?: string | null;
  bpm: number;
  difficulty?: string | null;
  admin_difficulty?: string | null;
  preview_image?: string | null;
  youtube_url?: string | null;
  description?: string | null;
  data_json: string;
  play_count: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApiScore {
  id: string;
  user_id: string;
  chart_id: string;
  accuracy: number;
  created_at?: string | null;
  user?: {
    id: string;
    email: string;
    role?: string;
    nickname?: string | null;
    profile?: any;
  } | null;
  chart?: {
    id: string;
    title: string;
    difficulty?: string | null;
  } | null;
}

export interface ApiUserAggregate {
  user_id: string;
  avg_accuracy: number | null;
  max_accuracy: number | null;
  play_count: number;
  user?: {
    id: string;
    email: string;
    role?: string;
    nickname?: string | null;
  } | null;
}

export interface ApiNotice {
  title: string;
  content: string;
  updatedAt: string;
}

export interface ApiVersion {
  version: string;
  changelog: string[];
  updatedAt: string;
}

const toJson = async (res: Response) => {
  if (!res.ok) {
    const text = await res.text();
    const error = new Error(text || res.statusText) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
};

export const api = {
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    return toJson(res);
  },
  async logout() {
    const res = await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    return toJson(res);
  },
  async me() {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
    return toJson(res);
  },
  async updateDisplayName(displayName: string) {
    const res = await fetch(`${API_BASE}/api/profile/display-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ displayName }),
    });
    return toJson(res);
  },
  async getProfileSettings() {
    const res = await fetch(`${API_BASE}/api/profile/settings`, {
      credentials: 'include',
    });
    return toJson(res) as Promise<{ settings: unknown | null }>;
  },
  async updateProfileSettings(settings: unknown) {
    const res = await fetch(`${API_BASE}/api/profile/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ settings }),
    });
    return toJson(res) as Promise<{ settings: unknown | null }>;
  },
  async getCharts(params: {
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
    status?: 'approved' | 'wip';
  }) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.status) qs.set('status', params.status);
    const res = await fetch(`${API_BASE}/api/charts?${qs.toString()}`, { credentials: 'include' });
    return toJson(res) as Promise<{ charts: ApiChart[]; total: number }>;
  },
  async getChartById(id: string) {
    const res = await fetch(`${API_BASE}/api/charts/${id}`, { credentials: 'include' });
    return toJson(res) as Promise<{ chart: ApiChart }>;
  },
  async incrementChartPlayCount(id: string) {
    const res = await fetch(`${API_BASE}/api/charts/${id}`, {
      method: 'POST',
      credentials: 'include',
    });
    return toJson(res) as Promise<{ chart: ApiChart }>;
  },
  async updateChart(id: string, payload: {
    title: string;
    bpm: number;
    dataJson: string;
    youtubeUrl?: string | null;
    description?: string | null;
    difficulty?: string | null;
    previewImage?: string | null;
  }) {
    const res = await fetch(`${API_BASE}/api/charts/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return toJson(res) as Promise<{ chart: ApiChart }>;
  },
  async getPendingCharts(status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') {
    const qs = new URLSearchParams();
    qs.set('status', status);
    const res = await fetch(`${API_BASE}/api/charts/pending?${qs.toString()}`, {
      credentials: 'include',
    });
    return toJson(res) as Promise<{ status: string; charts: ApiChart[] }>;
  },
  async updateChartStatus(id: string, status: 'approved' | 'rejected' | 'pending', comment?: string) {
    const res = await fetch(`${API_BASE}/api/charts/${id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status, comment }),
    });
    return toJson(res);
  },
  async deleteChart(id: string) {
    const res = await fetch(`${API_BASE}/api/charts/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return toJson(res) as Promise<{ success: boolean; id: string }>;
  },

  async getLeaderboard(chartId?: string) {
    const qs = chartId ? `?chartId=${encodeURIComponent(chartId)}` : '';
    const res = await fetch(`${API_BASE}/api/leaderboard${qs}`, { credentials: 'include' });
    return toJson(res) as Promise<{ perChart: ApiScore[]; global: ApiScore[]; perUser: ApiUserAggregate[] }>;
  },

  async submitScore(chartId: string, accuracy: number) {
    const res = await fetch(`${API_BASE}/api/leaderboard`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartId, accuracy }),
    });
    return toJson(res) as Promise<{ score: ApiScore }>;
  },

  async getNotice() {
    const res = await fetch(`${API_BASE}/api/notice`, { credentials: 'include' });
    if (!res.ok) {
      // GET 요청은 항상 성공해야 하므로, 401이 나와도 기본값 반환
      if (res.status === 401) {
        console.warn('Notice GET returned 401, returning default');
        return {
          title: '공지사항',
          content: '공지사항을 불러올 수 없습니다.\n\n로그인이 필요할 수 있습니다.',
          updatedAt: new Date().toISOString(),
        } as ApiNotice;
      }
    }
    return toJson(res) as Promise<ApiNotice>;
  },

  async updateNotice(title: string, content: string) {
    try {
    const res = await fetch(`${API_BASE}/api/notice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ title, content }),
    });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const error = new Error(errorData.error || errorData.message || 'Failed to update notice');
        (error as any).status = res.status;
        (error as any).details = errorData.details;
        (error as any).code = errorData.code;
        throw error;
      }
    return toJson(res) as Promise<ApiNotice>;
    } catch (error: any) {
      // 네트워크 에러 처리 (CORS, 연결 실패 등)
      if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
        console.error('Network error:', error);
        const networkError = new Error('네트워크 연결에 실패했습니다. API 서버가 실행 중인지 확인해주세요.');
        (networkError as any).isNetworkError = true;
        (networkError as any).originalError = error;
        (networkError as any).url = `${API_BASE}/api/notice`;
        throw networkError;
      }
      throw error;
    }
  },

  async getVersion() {
    const res = await fetch(`${API_BASE}/api/version`, { credentials: 'include' });
    if (!res.ok) {
      // GET 요청은 항상 성공해야 하므로, 401이 나와도 기본값 반환
      if (res.status === 401) {
        console.warn('Version GET returned 401, returning default');
        return {
          version: '1.0.0',
          changelog: ['버전 정보를 불러올 수 없습니다.', '로그인이 필요할 수 있습니다.'],
          updatedAt: new Date().toISOString(),
        } as ApiVersion;
      }
    }
    return toJson(res) as Promise<ApiVersion>;
  },

  async updateVersion(version: string, changelog: string[]) {
    try {
    const res = await fetch(`${API_BASE}/api/version`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ version, changelog }),
    });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const error = new Error(errorData.error || errorData.message || 'Failed to update version');
        (error as any).status = res.status;
        (error as any).details = errorData.details;
        (error as any).code = errorData.code;
        throw error;
      }
    return toJson(res) as Promise<ApiVersion>;
    } catch (error: any) {
      // 네트워크 에러 처리 (CORS, 연결 실패 등)
      if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
        console.error('Network error:', error);
        const networkError = new Error('네트워크 연결에 실패했습니다. API 서버가 실행 중인지 확인해주세요.');
        (networkError as any).isNetworkError = true;
        (networkError as any).originalError = error;
        (networkError as any).url = `${API_BASE}/api/version`;
        throw networkError;
      }
      throw error;
    }
  },
};

