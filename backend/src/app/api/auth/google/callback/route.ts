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

const fail = (reason: string, detail?: any, status = 500) => {
  // detail은 로그에만 남기고, 응답에는 요약만 전달
  console.error('[google-callback]', reason, detail);
  const response: any = { error: reason };
  if (process.env.NODE_ENV === 'development' && detail) {
    if (typeof detail === 'object' && detail.message) {
      response.message = detail.message;
    } else if (typeof detail === 'string') {
      response.message = detail;
    }
  }
  return NextResponse.json(response, { status });
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // redirect target

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return fail('Google OAuth not configured', null, 500);
  }
  if (!code) {
    return fail('Missing code', null, 400);
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
      return fail('token_exchange_failed', tokenJson, 500);
    }

    // 2) 유저 정보
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = await userRes.json();
    if (!userRes.ok || !userJson.email) {
      return fail('userinfo_failed', userJson, 500);
    }

    const email = userJson.email as string;
    const googleId = userJson.id as string;
    const name = userJson.name as string | undefined;

    // 3) 사용자 upsert
    let user;
    try {
      user = await prisma.user.upsert({
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
    } catch (dbError: any) {
      // Railway 데이터베이스 인증 실패 처리
      console.error('❌ Database error during OAuth callback:', dbError);
      const errorMessage = dbError?.message || String(dbError);
      const isAuthError = errorMessage.includes('Authentication failed') || 
                         errorMessage.includes('credentials for `postgres` are not valid');
      
      if (isAuthError && process.env.NODE_ENV === 'development') {
        // 로컬 환경에서 Railway DB 접근 실패 시 안내
        return fail('database_connection_failed', {
          message: 'Railway 데이터베이스에 연결할 수 없습니다. 로컬 환경에서는 Railway DB 접근이 제한될 수 있습니다.',
          hint: '로컬 개발을 위해 별도의 로컬 데이터베이스를 사용하거나, Railway 데이터베이스의 Public Access 설정을 확인하세요.',
          originalError: errorMessage,
        }, 503);
      }
      
      return fail('database_error', {
        message: errorMessage,
        name: dbError?.name,
      }, 503);
    }

    // 4) 세션 쿠키 발급 + redirect (쿠키를 redirect 응답에 직접 붙여야 함)
    // profile.role이 있으면 우선 사용, 없으면 user.role 사용
    const effectiveRole = user.profile?.role || user.role;
    const token = signSession({ userId: user.id, role: effectiveRole });
    console.log('Session created:', { userId: user.id, userRole: user.role, profileRole: user.profile?.role, effectiveRole });
    const redirectTarget = state || '/';
    const response = NextResponse.redirect(redirectTarget, { status: 302 });
    
    // redirect 응답에 쿠키를 직접 설정
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC,
      // 프로덕션에서는 .userhythm.kr 형태로 설정하여 모든 서브도메인에서 사용 가능하도록
      domain: COOKIE_DOMAIN || (isProd ? '.userhythm.kr' : undefined),
    });
    
    return response;
  } catch (error) {
    // 기타 예상치 못한 에러
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('OAuth callback unexpected error:', { errorMessage, errorStack });
    return fail('oauth_failed', { message: errorMessage, stack: errorStack }, 500);
  }
}

