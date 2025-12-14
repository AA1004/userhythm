// 로컬 개발: VITE_API_BASE가 비어있으면 Vite 프록시 사용 (빈 문자열 → /api/... 요청)
// 프로덕션: 반드시 VITE_API_BASE 설정 필요 (예: https://api.userhythm.kr)
const API_BASE = import.meta.env.VITE_API_BASE || '';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '';

// localhost:5173에서 접속하면 자동으로 ADMIN 토큰 사용
const isLocalhostDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port === '5173';

// ADMIN 토큰 헤더 가져오기 (localhost:5173이면 항상 ADMIN 토큰 반환)
const getAdminToken = () => {
  if (isLocalhostDev) {
    // localhost:5173이면 환경변수나 기본값 사용
    return ADMIN_TOKEN || 'admin123';
  }
  return ADMIN_TOKEN;
};

export interface ApiChart {
  id: string;
  title: string;
  author: string;
  author_role?: string | null;
  author_nickname?: string | null;
  author_email_prefix?: string | null;
  bpm: number;
  difficulty?: string | null;
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
    throw new Error(text || res.statusText);
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
  async getCharts(params: { search?: string; sortBy?: string; sortOrder?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const res = await fetch(`${API_BASE}/api/charts?${qs.toString()}`, { credentials: 'include' });
    return toJson(res) as Promise<{ charts: ApiChart[]; total: number }>;
  },
  async getChartById(id: string) {
    const res = await fetch(`${API_BASE}/api/charts/${id}`, { credentials: 'include' });
    return toJson(res) as Promise<{ chart: ApiChart }>;
  },
  async getPendingCharts() {
    const res = await fetch(`${API_BASE}/api/charts/pending`, {
      headers: { 'x-admin-token': getAdminToken() },
      credentials: 'include',
    });
    return toJson(res) as Promise<{ charts: ApiChart[] }>;
  },
  async updateChartStatus(id: string, status: 'approved' | 'rejected' | 'pending', comment?: string) {
    const res = await fetch(`${API_BASE}/api/charts/${id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': getAdminToken(),
      },
      credentials: 'include',
      body: JSON.stringify({ status, comment }),
    });
    return toJson(res);
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
  },
};

