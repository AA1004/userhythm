import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { validateChartDataJson } from '../../../lib/chartData';
import { isPlaySessionSecretConfigured, signPlaySessionToken } from '../../../lib/playSession';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const getClientKey = (req: NextRequest): string => {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || req.headers.get('x-real-ip') || 'unknown';
};

const checkRateLimit = (key: string): boolean => {
  const now = Date.now();
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX) return false;
  current.count += 1;
  return true;
};

export async function POST(req: NextRequest) {
  try {
    if (!isPlaySessionSecretConfigured()) {
      return NextResponse.json({ error: 'play_session_not_configured' }, { status: 500 });
    }

    if (!checkRateLimit(getClientKey(req))) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const chartId = (body as { chartId?: unknown }).chartId;
    if (!chartId || typeof chartId !== 'string') {
      return NextResponse.json({ error: 'invalid_chart_id' }, { status: 400 });
    }

    const chart = await prisma.chart.findUnique({
      where: { id: chartId },
      select: { id: true, dataJson: true, status: true },
    });
    if (!chart || chart.status !== 'approved') {
      return NextResponse.json({ error: 'chart_not_found' }, { status: 404 });
    }

    const validated = validateChartDataJson(chart.dataJson, { allowAdminDifficulty: true });
    if (!validated.ok) {
      return NextResponse.json({ error: 'invalid_chart_data' }, { status: 422 });
    }
    if (validated.expectedJudgments <= 0) {
      return NextResponse.json({ error: 'chart_has_no_judgments' }, { status: 422 });
    }

    const playSessionToken = signPlaySessionToken({
      chartId: chart.id,
      chartHash: validated.chartHash,
      expectedJudgments: validated.expectedJudgments,
    });

    return NextResponse.json({
      playSessionToken,
      expectedJudgments: validated.expectedJudgments,
      chartHash: validated.chartHash,
    });
  } catch (error) {
    console.error('play session create error', error);
    return NextResponse.json({ error: 'failed_to_create_play_session' }, { status: 500 });
  }
}
