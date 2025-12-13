import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { email, password, nickname } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'email already exists' }, { status: 409 });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'user',
        profile: {
          create: {
            nickname: nickname ?? null,
            role: 'user',
            nicknameUpdatedAt: nickname ? new Date().toISOString() : null,
          },
        },
      },
      include: { profile: true },
    });
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, profile: user.profile } });
  } catch (error: any) {
    // 데이터베이스 연결 실패 시 명확한 에러 메시지 반환
    const isDbConnectionError = 
      error?.name === 'PrismaClientInitializationError' ||
      error?.message?.includes('Authentication failed') ||
      error?.message?.includes('database server');
    
    if (isDbConnectionError) {
      console.error('❌ Database connection failed during signup');
      if (process.env.NODE_ENV === 'development') {
        console.error('💡 To enable signup locally, set DATABASE_URL in backend/.env');
        return NextResponse.json({ 
          error: 'database_connection_failed',
          message: 'Database connection failed. Please check your DATABASE_URL in backend/.env' 
        }, { status: 503 });
      }
      return NextResponse.json({ error: 'database_connection_failed' }, { status: 503 });
    }
    
    console.error('signup error', error);
    return NextResponse.json({ error: 'failed to signup' }, { status: 500 });
  }
}

