import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getSessionFromRequest } from '../../../../../lib/auth';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { displayName } = await req.json();
    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({ where: { userId: session.userId } });
    if (!profile) return NextResponse.json({ error: 'profile not found' }, { status: 404 });

    if (profile.nicknameUpdatedAt) {
      const nextAllowed = new Date(profile.nicknameUpdatedAt.getTime() + ONE_WEEK_MS);
      if (new Date() < nextAllowed) {
        return NextResponse.json({ success: false, nextChangeAt: nextAllowed }, { status: 200 });
      }
    }

    await prisma.profile.update({
      where: { userId: session.userId },
      data: {
        nickname: displayName,
        nicknameUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('display-name error', error);
    return NextResponse.json({ error: 'failed to update display name' }, { status: 500 });
  }
}

