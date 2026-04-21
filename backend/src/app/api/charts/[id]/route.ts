import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { Chart } from '@prisma/client';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const serializeChart = (chart: Chart, opts?: { authorRole?: string; authorNickname?: string; authorEmail?: string }) => ({
  id: chart.id,
  title: chart.title,
  author: chart.author,
  author_role: opts?.authorRole ?? null,
  author_nickname: opts?.authorNickname ?? null,
  author_email_prefix: opts?.authorEmail ? opts.authorEmail.split('@')[0] : null,
  bpm: chart.bpm,
  difficulty: chart.difficulty,
  preview_image: chart.previewImage ?? null,
  youtube_url: chart.youtubeUrl ?? null,
  description: chart.description ?? null,
  data_json: chart.dataJson,
  play_count: chart.playCount,
  status: chart.status,
  created_at: (chart as any).createdAt?.toISOString?.() ?? null,
  updated_at: (chart as any).updatedAt?.toISOString?.() ?? null,
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const chart = await prisma.chart.findUnique({
      where: { id: params.id },
      include: { user: { include: { profile: true } } },
    });
    if (!chart) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      chart: serializeChart(chart, {
        authorRole: chart.user?.profile?.role || chart.user?.role || undefined,
        authorNickname: chart.user?.profile?.nickname || (chart.user?.profile as any)?.display_name || undefined,
        authorEmail: chart.user?.email || undefined,
      }),
    });
  } catch (error) {
    console.error('chart detail error', error);
    return NextResponse.json({ error: 'failed to load chart' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('x-admin-token') || '';
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const existingChart = await prisma.chart.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existingChart) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    await prisma.chart.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, id: params.id });
  } catch (error) {
    console.error('chart delete error', error);
    return NextResponse.json({ error: 'failed to delete chart' }, { status: 500 });
  }
}

