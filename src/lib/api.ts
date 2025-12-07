// 로컬 개발: VITE_API_BASE가 비어있으면 Vite 프록시 사용 (빈 문자열 → /api/... 요청)
// 프로덕션: 반드시 VITE_API_BASE 설정 필요 (예: https://api.userhythm.kr)
const API_BASE = import.meta.env.VITE_API_BASE || '';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '';

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
      headers: { 'x-admin-token': ADMIN_TOKEN },
      credentials: 'include',
    });
    return toJson(res) as Promise<{ charts: ApiChart[] }>;
  },
  async updateChartStatus(id: string, status: 'approved' | 'rejected' | 'pending', comment?: string) {
    const res = await fetch(`${API_BASE}/api/charts/${id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': ADMIN_TOKEN,
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
};

