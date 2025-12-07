import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { signSession } from '../../../../../lib/auth';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'https://api.userhythm.kr/api/auth/google/callback';

const SESSION_COOKIE = 'ur_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;
const isProd = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // redirect target

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });
  }
  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  try {
    // 1) 토큰 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error('google token error', tokenJson);
      return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 });
    }

    // 2) 유저 정보
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = await userRes.json();
    if (!userRes.ok || !userJson.email) {
      console.error('google userinfo error', userJson);
      return NextResponse.json({ error: 'Failed to fetch user info' }, { status: 500 });
    }

    const email = userJson.email as string;
    const googleId = userJson.id as string;
    const name = userJson.name as string | undefined;

    // 3) 사용자 upsert
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        googleId,
      },
      create: {
        email,
        passwordHash: null,
        role: 'user',
        googleId,
        profile: {
          create: {
            nickname: name || email,
            role: 'user',
            nicknameUpdatedAt: null,
          },
        },
      },
      include: { profile: true },
    });

    // 4) 세션 쿠키 발급 + redirect (쿠키를 redirect 응답에 직접 붙여야 함)
    const token = signSession({ userId: user.id, role: user.role });
    const redirectTarget = state || '/';
    const response = NextResponse.redirect(redirectTarget, { status: 302 });
    
    // redirect 응답에 쿠키를 직접 설정
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC,
      domain: COOKIE_DOMAIN || undefined,
    });
    
    return response;
  } catch (error) {
    console.error('google callback error', error);
    return NextResponse.json({ error: 'OAuth failed' }, { status: 500 });
  }
}

