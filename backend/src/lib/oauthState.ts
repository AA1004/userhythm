import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_APP_ORIGIN = 'https://userhythm.kr';
const OFFICIAL_REDIRECT_ORIGINS = [
  DEFAULT_APP_ORIGIN,
  'https://www.userhythm.kr',
];
const DEV_REDIRECT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

interface OAuthStatePayload {
  redirect: string;
  nonce: string;
  iat: number;
  exp: number;
}

const base64UrlEncode = (value: string | Buffer): string =>
  Buffer.from(value).toString('base64url');

const base64UrlDecode = (value: string): string =>
  Buffer.from(value, 'base64url').toString('utf8');

const getStateSecret = (): string =>
  process.env.OAUTH_STATE_SECRET ||
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-change-me');

export const isOAuthStateSecretConfigured = (): boolean => getStateSecret().length > 0;

const configuredOrigins = (): string[] => {
  const envOrigins = (process.env.OAUTH_REDIRECT_ORIGINS || process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const singleOrigin = process.env.FRONTEND_ORIGIN?.trim();
  return [
    ...OFFICIAL_REDIRECT_ORIGINS,
    ...(singleOrigin ? [singleOrigin] : []),
    ...envOrigins,
    ...(process.env.NODE_ENV === 'production' ? [] : DEV_REDIRECT_ORIGINS),
  ];
};

const normalizeOrigin = (origin: string): string | null => {
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return null;
  }
};

const allowedRedirectOrigins = (): Set<string> =>
  new Set(configuredOrigins().map(normalizeOrigin).filter((origin): origin is string => Boolean(origin)));

const primaryAppOrigin = (): string => {
  const configured = normalizeOrigin(process.env.FRONTEND_ORIGIN || '');
  if (configured && allowedRedirectOrigins().has(configured)) return configured;
  return DEFAULT_APP_ORIGIN;
};

const toRelativePath = (value: string): string | null => {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const parsed = new URL(value, DEFAULT_APP_ORIGIN);
    if (parsed.origin !== DEFAULT_APP_ORIGIN) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
};

export const resolveSafeRedirectTarget = (rawRedirect?: string | null): string => {
  const fallback = `${primaryAppOrigin()}/`;
  const trimmed = rawRedirect?.trim();
  if (!trimmed) return fallback;

  const relativePath = toRelativePath(trimmed);
  if (relativePath) return `${primaryAppOrigin()}${relativePath}`;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return fallback;
  }

  if (!allowedRedirectOrigins().has(parsed.origin)) return fallback;
  return parsed.toString();
};

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export const createOAuthState = (rawRedirect?: string | null): string => {
  const secret = getStateSecret();
  if (!secret) {
    throw new Error('oauth_state_secret_missing');
  }

  const now = Date.now();
  const payload: OAuthStatePayload = {
    redirect: resolveSafeRedirectTarget(rawRedirect),
    nonce: randomBytes(16).toString('base64url'),
    iat: now,
    exp: now + STATE_MAX_AGE_MS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
};

export const verifyOAuthState = (state: string | null): OAuthStatePayload | null => {
  const secret = getStateSecret();
  if (!secret || !state) return null;

  const [encodedPayload, signature, extra] = state.split('.');
  if (!encodedPayload || !signature || extra !== undefined) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<OAuthStatePayload>;
    if (
      typeof payload.redirect !== 'string' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp < Date.now() || payload.iat > Date.now() + 30_000) return null;
    const safeRedirect = resolveSafeRedirectTarget(payload.redirect);
    if (safeRedirect !== payload.redirect) return null;
    return payload as OAuthStatePayload;
  } catch {
    return null;
  }
};
