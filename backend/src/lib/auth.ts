import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SESSION_COOKIE = 'ur_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;
const isProd = process.env.NODE_ENV === 'production';

interface SessionPayload {
  userId: string;
  role: string;
}

export const signSession = (payload: SessionPayload) =>
  jwt.sign(payload, SESSION_SECRET, { expiresIn: SESSION_MAX_AGE_SEC });

export const setSessionCookie = (token: string) => {
  const cookieStore = cookies();
  // 프로덕션에서는 .userhythm.kr 형태로 설정하여 모든 서브도메인에서 사용 가능하도록
  const cookieDomain = COOKIE_DOMAIN || (isProd ? '.userhythm.kr' : undefined);
  
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // 서로 다른 서브도메인(userhythm.kr vs api.userhythm.kr) 간 쿠키 전달을 위해 None/secure 사용
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
    domain: cookieDomain,
  });
  
  console.log('Session cookie set:', {
    domain: cookieDomain,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    isProd,
  });
};

export const clearSessionCookie = () => {
  const cookieStore = cookies();
  // 프로덕션에서는 .userhythm.kr 형태로 설정하여 모든 서브도메인에서 사용 가능하도록
  const cookieDomain = COOKIE_DOMAIN || (isProd ? '.userhythm.kr' : undefined);
  
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: 0,
    domain: cookieDomain,
  });
};

export const getSessionFromRequest = (req: NextRequest): SessionPayload | null => {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) {
    console.log('getSessionFromRequest: No cookie found', {
      cookieName: SESSION_COOKIE,
      allCookies: req.cookies.getAll().map(c => c.name),
    });
    return null;
  }
  try {
    const decoded = jwt.verify(cookie, SESSION_SECRET) as SessionPayload;
    return decoded;
  } catch (error: any) {
    console.warn('getSessionFromRequest: JWT verification failed', {
      error: error?.name || error?.message,
      cookieLength: cookie.length,
      cookiePrefix: cookie.substring(0, 20),
    });
    return null;
  }
};

