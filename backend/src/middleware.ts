import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// 개발/배포 CORS 허용: 로컬(5173/5174/3000) + 프로덕션 도메인
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://userhythm.kr',
  'https://api.userhythm.kr',
];

export function middleware(req: NextRequest) {
  // API 경로만 처리
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  const headers = new Headers();
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  headers.set('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);

  // Preflight 응답
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers });
  }

  const res = NextResponse.next();
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

// API 경로에만 매칭
export const config = {
  matcher: ['/api/:path*'],
};

