import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, signPlaySession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const chartId = body && typeof body.chartId === 'string' ? body.chartId : '';
    if (!chartId) {
      return NextResponse.json({ error: 'invalid_chart_id' }, { status: 400 });
    }

    const chart = await prisma.chart.findUnique({
      where: { id: chartId },
      select: { id: true },
    });
    if (!chart) {
      return NextResponse.json({ error: 'chart_not_found' }, { status: 404 });
    }

    return NextResponse.json({
      playSessionToken: signPlaySession({
        userId: session.userId,
        chartId,
      }),
    });
  } catch (error) {
    console.error('play session create error', error);
    return NextResponse.json({ error: 'failed_to_create_play_session' }, { status: 500 });
  }
}
