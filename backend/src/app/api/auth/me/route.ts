import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getSessionFromRequest } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { profile: true },
    });
    if (!user) return NextResponse.json({ user: null }, { status: 200 });
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, profile: user.profile } });
  } catch (error: any) {
    // 데이터베이스 연결 실패 시 로컬 환경에서는 로그인되지 않은 상태로 처리
    const isDbConnectionError = 
      error?.name === 'PrismaClientInitializationError' ||
      error?.message?.includes('Authentication failed') ||
      error?.message?.includes('database server');
    
    if (isDbConnectionError && process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Database connection failed in development. Returning null user.');
      console.warn('Error:', error?.message || String(error));
      return NextResponse.json({ user: null }, { status: 200 });
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('me error', {
      message: errorMessage,
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'failed to fetch session', details: process.env.NODE_ENV === 'development' ? errorMessage : undefined }, { status: 500 });
  }
}

