import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SESSION_COOKIE = 'ur_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
const PLAY_SESSION_MAX_AGE_SEC = 60 * 60 * 6; // 6 hours
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;
const isProd = process.env.NODE_ENV === 'production';

const getSessionSecret = () => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (isProd) {
    throw new Error('SESSION_SECRET must be set in production');
  }
  return 'dev-secret-change-me';
};

const SESSION_SECRET = getSessionSecret();

interface SessionPayload {
  userId: string;
  role: string;
}

export interface PlaySessionPayload {
  type: 'play-session';
  userId: string;
  chartId: string;
  startedAt: number;
}

export const signSession = (payload: SessionPayload) =>
  jwt.sign(payload, SESSION_SECRET, { expiresIn: SESSION_MAX_AGE_SEC });

export const signPlaySession = (payload: { userId: string; chartId: string }) =>
  jwt.sign(
    {
      type: 'play-session',
      userId: payload.userId,
      chartId: payload.chartId,
      startedAt: Date.now(),
    },
    SESSION_SECRET,
    { expiresIn: PLAY_SESSION_MAX_AGE_SEC }
  );

export const verifyPlaySession = (token: string): PlaySessionPayload | null => {
  try {
    const decoded = jwt.verify(token, SESSION_SECRET) as Partial<PlaySessionPayload>;
    if (
      decoded.type !== 'play-session' ||
      typeof decoded.userId !== 'string' ||
      typeof decoded.chartId !== 'string' ||
      typeof decoded.startedAt !== 'number'
    ) {
      return null;
    }
    return {
      type: 'play-session',
      userId: decoded.userId,
      chartId: decoded.chartId,
      startedAt: decoded.startedAt,
    };
  } catch {
    return null;
  }
};

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

  if (!isProd) {
    console.log('Session cookie set:', {
      domain: cookieDomain,
      sameSite: 'lax',
      secure: false,
    });
  }
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
    if (!isProd) {
      console.log('getSessionFromRequest: No cookie found', {
        cookieName: SESSION_COOKIE,
        allCookies: req.cookies.getAll().map(c => c.name),
      });
    }
    return null;
  }
  try {
    const decoded = jwt.verify(cookie, SESSION_SECRET) as SessionPayload;
    return decoded;
  } catch (error: any) {
    if (isProd) {
      console.warn('getSessionFromRequest: JWT verification failed');
    } else {
      console.warn('getSessionFromRequest: JWT verification failed', {
        error: error?.name || error?.message,
        cookieLength: cookie.length,
        cookiePrefix: cookie.substring(0, 20),
      });
    }
    return null;
  }
};

