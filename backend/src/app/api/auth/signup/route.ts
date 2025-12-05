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
  } catch (error) {
    console.error('signup error', error);
    return NextResponse.json({ error: 'failed to signup' }, { status: 500 });
  }
}

