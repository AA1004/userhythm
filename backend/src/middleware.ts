import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = ['https://userhythm.kr', 'https://www.userhythm.kr'];
const isProd = process.env.NODE_ENV === 'production';

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

const isLocalOrigin = (origin: string) =>
  !isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const resolveAllowedOrigin = (origin: string | null) => {
  if (!origin) return null;
  const normalized = origin.replace(/\/+$/, '');
  if (allowedOrigins.has(normalized) || isLocalOrigin(normalized)) {
    return normalized;
  }
  return null;
};

const applyCorsHeaders = (response: NextResponse, allowedOrigin: string | null) => {
  response.headers.set('Vary', 'Origin');
  if (!allowedOrigin) return response;

  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
};

export function middleware(req: NextRequest) {
  const allowedOrigin = resolveAllowedOrigin(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), allowedOrigin);
  }

  return applyCorsHeaders(NextResponse.next(), allowedOrigin);
}

export const config = {
  matcher: '/api/:path*',
};
