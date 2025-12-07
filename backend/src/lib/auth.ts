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
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // 서로 다른 서브도메인(userhythm.kr vs api.userhythm.kr) 간 쿠키 전달을 위해 None/secure 사용
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
    domain: COOKIE_DOMAIN || undefined,
  });
};

export const clearSessionCookie = () => {
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: 0,
    domain: COOKIE_DOMAIN || undefined,
  });
};

export const getSessionFromRequest = (req: NextRequest): SessionPayload | null => {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    return jwt.verify(cookie, SESSION_SECRET) as SessionPayload;
  } catch {
    return null;
  }
};

