import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getSessionFromRequest } from '../../../lib/auth';

const serializeScore = (score: any) => ({
  id: score.id,
  user_id: score.userId,
  chart_id: score.chartId,
  accuracy: score.accuracy,
  created_at: (score as any).createdAt?.toISOString?.() ?? null,
  user: score.user
    ? {
        id: score.user.id,
        email: score.user.email,
        role: score.user.role,
        profile: score.user.profile,
        nickname: score.user.profile?.nickname || (score.user.profile as any)?.display_name || null,
      }
    : null,
  chart: score.chart
    ? {
        id: score.chart.id,
        title: score.chart.title,
        difficulty: score.chart.difficulty,
      }
    : null,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chartId = searchParams.get('chartId');

    // per-chart leaderboard (top 20)
    const perChart =
      chartId &&
      (await prisma.score.findMany({
        where: { chartId },
        orderBy: { accuracy: 'desc' },
        take: 20,
        include: { user: { include: { profile: true } }, chart: true },
      })).map(serializeScore);

    // global leaderboard (top 20)
    const global = (
      await prisma.score.findMany({
        orderBy: { accuracy: 'desc' },
        take: 20,
        include: { user: { include: { profile: true } }, chart: true },
      })
    ).map(serializeScore);

    // per-user average accuracy (top 20)
    const grouped = await prisma.score.groupBy({
      by: ['userId'],
      _avg: { accuracy: true },
      _max: { accuracy: true },
      _count: { _all: true },
      orderBy: { _avg: { accuracy: 'desc' } },
      take: 20,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) } },
      include: { profile: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const perUser = grouped.map((g) => {
      const u = userMap.get(g.userId);
      return {
        user_id: g.userId,
        avg_accuracy: g._avg.accuracy,
        max_accuracy: g._max.accuracy,
        play_count: g._count._all,
        user: u
          ? {
              id: u.id,
              email: u.email,
              role: u.role,
              nickname: u.profile?.nickname || (u.profile as any)?.display_name || null,
            }
          : null,
      };
    });

    return NextResponse.json({
      perChart: perChart || [],
      global,
      perUser,
    });
  } catch (error) {
    console.error('leaderboard get error', error);
    return NextResponse.json({ error: 'failed to load leaderboard' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const { chartId, accuracy } = body as { chartId?: string; accuracy?: number };
    if (!chartId || typeof chartId !== 'string') {
      return NextResponse.json({ error: 'invalid_chart_id' }, { status: 400 });
    }
    const accNum = Number(accuracy);
    if (!Number.isFinite(accNum) || accNum < 0 || accNum > 100) {
      return NextResponse.json({ error: 'invalid_accuracy' }, { status: 400 });
    }

    // ensure chart exists
    const chart = await prisma.chart.findUnique({ where: { id: chartId } });
    if (!chart) {
      return NextResponse.json({ error: 'chart_not_found' }, { status: 404 });
    }

    const score = await prisma.score.create({
      data: {
        chartId,
        userId: session.userId,
        accuracy: accNum,
      },
      include: { user: { include: { profile: true } }, chart: true },
    });

    return NextResponse.json({ score: serializeScore(score) }, { status: 201 });
  } catch (error) {
    console.error('leaderboard post error', error);
    return NextResponse.json({ error: 'failed to submit score' }, { status: 500 });
  }
}

