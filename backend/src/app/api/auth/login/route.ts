import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { signSession, setSessionCookie } from '../../../../lib/auth';

const isProd = process.env.NODE_ENV === 'production';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
    }
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
    }
    // profile.role이 있으면 우선 사용, 없으면 user.role 사용
    const effectiveRole = user.profile?.role || user.role;
    const token = signSession({ userId: user.id, role: effectiveRole });
    if (!isProd) {
      console.log('Session created:', {
        userId: user.id,
        userRole: user.role,
        profileRole: user.profile?.role,
        effectiveRole,
      });
    }
    setSessionCookie(token);
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, profile: user.profile } });
  } catch (error: any) {
    // 데이터베이스 연결 실패 시 명확한 에러 메시지 반환
    const isDbConnectionError = 
      error?.name === 'PrismaClientInitializationError' ||
      error?.message?.includes('Authentication failed') ||
      error?.message?.includes('database server');
    
    if (isDbConnectionError) {
      console.error('❌ Database connection failed during login');
      if (process.env.NODE_ENV === 'development') {
        console.error('💡 To enable login locally, set DATABASE_URL in backend/.env');
        return NextResponse.json({ 
          error: 'database_connection_failed',
          message: 'Database connection failed. Please check your DATABASE_URL in backend/.env' 
        }, { status: 503 });
      }
      return NextResponse.json({ error: 'database_connection_failed' }, { status: 503 });
    }
    
    if (isProd) {
      console.error('login error');
    } else {
      console.error('login error', error);
    }
    return NextResponse.json({ error: 'failed to login' }, { status: 500 });
  }
}

