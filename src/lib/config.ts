const DEFAULT_PRODUCTION_API_BASE = 'https://api.userhythm.kr';

const normalizeApiBase = (value: string) => value.trim().replace(/\/+$/, '');

const isLocalDevHost = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

const resolveApiBase = () => {
  const configured = import.meta.env.VITE_API_BASE;
  if (configured && configured.trim()) {
    return normalizeApiBase(configured);
  }

  // Local Vite uses vite.config.ts proxy for /api. Production must never fall
  // back to the GitHub Pages origin because the backend runs on Railway.
  if (isLocalDevHost()) {
    return '';
  }

  return DEFAULT_PRODUCTION_API_BASE;
};

export const API_BASE = resolveApiBase();
