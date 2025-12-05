import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SESSION_COOKIE = 'ur_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

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
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });
};

export const clearSessionCookie = () => {
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
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

