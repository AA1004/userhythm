import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const diagnosis: any = {
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'Set (Starts with ' + process.env.DATABASE_URL.substring(0, 10) + '...)' : 'Missing',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing',
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
      COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
    },
    db: {
      status: 'Checking...',
    },
  };

  try {
    // DB 연결 테스트
    await prisma.$connect();
    // 간단한 쿼리 실행
    const userCount = await prisma.user.count();
    diagnosis.db = {
      status: 'Connected',
      userCount,
    };
  } catch (error: any) {
    console.error('Health check DB error:', error);
    diagnosis.db = {
      status: 'Error',
      message: error.message,
      code: error.code,
    };
  }

  return NextResponse.json(diagnosis, { status: 200 });
}
