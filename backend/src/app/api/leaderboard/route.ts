import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getSessionFromRequest, verifyPlaySession } from '../../../lib/auth';

const serializeScore = (score: any, userMap?: Map<string, any>, chartMap?: Map<string, any>) => ({
  id: score.id,
  user_id: score.userId,
  chart_id: score.chartId,
  accuracy: score.accuracy,
  perfect: score.perfect ?? 0,
  great: score.great ?? 0,
  good: score.good ?? 0,
  miss: score.miss ?? 0,
  max_combo: score.maxCombo ?? 0,
  created_at: (score as any).createdAt?.toISOString?.() ?? null,
  user: (score.user ?? userMap?.get(score.userId))
    ? {
        id: (score.user ?? userMap?.get(score.userId)).id,
        email: (score.user ?? userMap?.get(score.userId)).email,
        role: (score.user ?? userMap?.get(score.userId)).role,
        profile: (score.user ?? userMap?.get(score.userId)).profile,
        nickname:
          (score.user ?? userMap?.get(score.userId)).profile?.nickname ||
          ((score.user ?? userMap?.get(score.userId)).profile as any)?.display_name ||
          null,
      }
    : null,
  chart: (score.chart ?? chartMap?.get(score.chartId))
    ? {
        id: (score.chart ?? chartMap?.get(score.chartId)).id,
        title: (score.chart ?? chartMap?.get(score.chartId)).title,
        difficulty: (score.chart ?? chartMap?.get(score.chartId)).difficulty,
      }
    : null,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chartId = searchParams.get('chartId');

    const [perChartRaw, globalRaw, aggregateRaw] = await Promise.all([
      chartId
        ? prisma.score.findMany({
            where: { chartId },
            orderBy: { accuracy: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
      prisma.score.findMany({
        orderBy: { accuracy: 'desc' },
        take: 20,
      }),
      prisma.score.findMany({
        select: {
          userId: true,
          accuracy: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);

    const scoreRows = [...perChartRaw, ...globalRaw];
    const aggregateByUser = new Map<
      string,
      { total: number; count: number; max: number }
    >();
    aggregateRaw.forEach((score) => {
      const current = aggregateByUser.get(score.userId) ?? {
        total: 0,
        count: 0,
        max: 0,
      };
      current.total += score.accuracy;
      current.count += 1;
      current.max = Math.max(current.max, score.accuracy);
      aggregateByUser.set(score.userId, current);
    });

    const userIds = Array.from(new Set([...scoreRows.map((score) => score.userId), ...aggregateByUser.keys()]));
    const chartIds = Array.from(new Set(scoreRows.map((score) => score.chartId)));

    const [users, charts] = await Promise.all([
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            include: { profile: true },
          })
        : Promise.resolve([]),
      chartIds.length > 0
        ? prisma.chart.findMany({
            where: { id: { in: chartIds } },
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const chartMap = new Map(charts.map((chart) => [chart.id, chart]));

    const perChart = perChartRaw.map((score) => serializeScore(score, userMap, chartMap));
    const global = globalRaw.map((score) => serializeScore(score, userMap, chartMap));

    const perUser = Array.from(aggregateByUser.entries())
      .map(([userId, aggregate]) => {
      const u = userMap.get(userId);
      return {
        user_id: userId,
        avg_accuracy: aggregate.count > 0 ? aggregate.total / aggregate.count : null,
        max_accuracy: aggregate.max,
        play_count: aggregate.count,
        user: u
          ? {
              id: u.id,
              email: u.email,
              role: u.role,
              nickname: u.profile?.nickname || (u.profile as any)?.display_name || null,
            }
          : null,
      };
      })
      .sort((a, b) => (b.avg_accuracy ?? 0) - (a.avg_accuracy ?? 0))
      .slice(0, 20);

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

const SCORE_COUNT_LIMIT = 100_000;

const parseScoreCount = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > SCORE_COUNT_LIMIT) return null;
  return value;
};

const calculateAccuracy = (counts: {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}) => {
  const total = counts.perfect + counts.great + counts.good + counts.miss;
  if (total <= 0) return null;
  return ((counts.perfect * 100 + counts.great * 80 + counts.good * 50) / (total * 100)) * 100;
};

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
    const {
      chartId,
      perfect,
      great,
      good,
      miss,
      maxCombo,
      playSessionToken,
    } = body as {
      chartId?: string;
      perfect?: unknown;
      great?: unknown;
      good?: unknown;
      miss?: unknown;
      maxCombo?: unknown;
      playSessionToken?: unknown;
    };
    if (!chartId || typeof chartId !== 'string') {
      return NextResponse.json({ error: 'invalid_chart_id' }, { status: 400 });
    }

    if (typeof playSessionToken !== 'string' || !playSessionToken) {
      return NextResponse.json({ error: 'invalid_play_session' }, { status: 400 });
    }
    const playSession = verifyPlaySession(playSessionToken);
    if (
      !playSession ||
      playSession.userId !== session.userId ||
      playSession.chartId !== chartId
    ) {
      return NextResponse.json({ error: 'invalid_play_session' }, { status: 400 });
    }

    const counts = {
      perfect: parseScoreCount(perfect),
      great: parseScoreCount(great),
      good: parseScoreCount(good),
      miss: parseScoreCount(miss),
    };
    const parsedMaxCombo = parseScoreCount(maxCombo);
    if (
      counts.perfect === null ||
      counts.great === null ||
      counts.good === null ||
      counts.miss === null ||
      parsedMaxCombo === null
    ) {
      return NextResponse.json({ error: 'invalid_score_breakdown' }, { status: 400 });
    }

    const total = counts.perfect + counts.great + counts.good + counts.miss;
    if (total <= 0 || parsedMaxCombo > total) {
      return NextResponse.json({ error: 'invalid_score_breakdown' }, { status: 400 });
    }

    const serverAccuracy = calculateAccuracy({
      perfect: counts.perfect,
      great: counts.great,
      good: counts.good,
      miss: counts.miss,
    });
    if (serverAccuracy === null) {
      return NextResponse.json({ error: 'invalid_score_breakdown' }, { status: 400 });
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
        accuracy: serverAccuracy,
        perfect: counts.perfect,
        great: counts.great,
        good: counts.good,
        miss: counts.miss,
        maxCombo: parsedMaxCombo,
      },
      include: { user: { include: { profile: true } }, chart: true },
    });

    return NextResponse.json({ score: serializeScore(score) }, { status: 201 });
  } catch (error) {
    console.error('leaderboard post error', error);
    return NextResponse.json({ error: 'failed to submit score' }, { status: 500 });
  }
}

