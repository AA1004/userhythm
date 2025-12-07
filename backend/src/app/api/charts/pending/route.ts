import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { Chart } from '@prisma/client';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const serializeChart = (chart: Chart) => ({
  id: chart.id,
  title: chart.title,
  author: chart.author,
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

export async function GET(request: Request) {
  try {
    const token = request.headers.get('x-admin-token') || '';
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const charts = await prisma.chart.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ charts: charts.map(serializeChart) });
  } catch (error) {
    console.error('pending charts error', error);
    return NextResponse.json({ error: 'failed to load pending charts' }, { status: 500 });
  }
}

