import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getSessionFromRequest } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

const MAX_SETTINGS_JSON_LENGTH = 12000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const profile = await prisma.profile.findUnique({
      where: { userId: session.userId },
      select: { settings: true },
    });

    if (!profile) return NextResponse.json({ error: 'profile not found' }, { status: 404 });
    return NextResponse.json({ settings: profile.settings ?? null });
  } catch (error) {
    console.error('profile settings get error', error);
    return NextResponse.json({ error: 'failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const settings = isPlainObject(body) ? body.settings : null;
    if (!isPlainObject(settings)) {
      return NextResponse.json({ error: 'invalid_settings' }, { status: 400 });
    }

    if (JSON.stringify(settings).length > MAX_SETTINGS_JSON_LENGTH) {
      return NextResponse.json({ error: 'settings_too_large' }, { status: 413 });
    }

    const profile = await prisma.profile.update({
      where: { userId: session.userId },
      data: {
        settings: settings as any,
        updatedAt: new Date(),
      },
      select: { settings: true },
    });

    return NextResponse.json({ settings: profile.settings ?? null });
  } catch (error) {
    console.error('profile settings update error', error);
    return NextResponse.json({ error: 'failed to save settings' }, { status: 500 });
  }
}
