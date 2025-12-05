import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getSessionFromRequest } from '../../../../lib/auth';

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
  } catch (error) {
    console.error('me error', error);
    return NextResponse.json({ error: 'failed to fetch session' }, { status: 500 });
  }
}

