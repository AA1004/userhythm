import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { signSession, setSessionCookie } from '../../../../lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
    }
    const token = signSession({ userId: user.id, role: user.role });
    setSessionCookie(token);
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role, profile: user.profile } });
  } catch (error) {
    console.error('login error', error);
    return NextResponse.json({ error: 'failed to login' }, { status: 500 });
  }
}

