import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { Chart } from '@prisma/client';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_DATA_JSON_LENGTH = 1_000_000;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_DIFFICULTY_LENGTH = 50;

const extractAdminDifficulty = (dataJson: string): string | null => {
  try {
    const parsed = JSON.parse(dataJson || '{}');
    return typeof parsed.adminDifficulty === 'string' && parsed.adminDifficulty.trim().length > 0
      ? parsed.adminDifficulty.trim().slice(0, MAX_DIFFICULTY_LENGTH)
      : null;
  } catch {
    return null;
  }
};

const serializeChart = (chart: Chart, opts?: { authorRole?: string; authorNickname?: string; authorEmail?: string }) => ({
  id: chart.id,
  title: chart.title,
  author: chart.author,
  author_role: opts?.authorRole ?? null,
  author_nickname: opts?.authorNickname ?? null,
  author_email_prefix: opts?.authorEmail ? opts.authorEmail.split('@')[0] : null,
  bpm: chart.bpm,
  difficulty: chart.difficulty,
  admin_difficulty: extractAdminDifficulty(chart.dataJson),
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('x-admin-token') || '';
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const {
      title,
      bpm,
      dataJson,
      youtubeUrl,
      description,
      difficulty,
      previewImage,
    }: {
      title?: string;
      bpm?: number | string;
      dataJson?: string;
      youtubeUrl?: string;
      description?: string;
      difficulty?: string;
      previewImage?: string;
    } = body;

    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle || trimmedTitle.length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: 'invalid_title' }, { status: 400 });
    }

    const bpmNumber = typeof bpm === 'string' ? parseFloat(bpm) : Number(bpm);
    if (!Number.isFinite(bpmNumber) || bpmNumber <= 0 || bpmNumber > 999) {
      return NextResponse.json({ error: 'invalid_bpm' }, { status: 400 });
    }

    if (typeof dataJson !== 'string' || dataJson.trim().length === 0 || dataJson.length > MAX_DATA_JSON_LENGTH) {
      return NextResponse.json({ error: 'invalid_dataJson' }, { status: 400 });
    }

    const trimmedDescription =
      typeof description === 'string' && description.trim().length > 0
        ? description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
        : null;
    const trimmedDifficulty =
      typeof difficulty === 'string' && difficulty.trim().length > 0
        ? difficulty.trim().slice(0, MAX_DIFFICULTY_LENGTH)
        : null;
    const trimmedYoutubeUrl =
      typeof youtubeUrl === 'string' && youtubeUrl.trim().length > 0 ? youtubeUrl.trim() : null;
    const trimmedPreviewImage =
      typeof previewImage === 'string' && previewImage.trim().length > 0 ? previewImage.trim() : null;

    const updated = await prisma.chart.update({
      where: { id: params.id },
      data: {
        title: trimmedTitle,
        bpm: bpmNumber,
        difficulty: trimmedDifficulty,
        description: trimmedDescription,
        youtubeUrl: trimmedYoutubeUrl,
        previewImage: trimmedPreviewImage,
        dataJson,
      },
      include: { user: { include: { profile: true } } },
    });

    return NextResponse.json({
      chart: serializeChart(updated, {
        authorRole: updated.user?.profile?.role || updated.user?.role || undefined,
        authorNickname: updated.user?.profile?.nickname || (updated.user?.profile as any)?.display_name || undefined,
        authorEmail: updated.user?.email || undefined,
      }),
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    console.error('chart update error', error);
    return NextResponse.json({ error: 'failed to update chart' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const chart = await prisma.chart.update({
      where: { id: params.id },
      data: {
        playCount: {
          increment: 1,
        },
      },
      include: { user: { include: { profile: true } } },
    });

    return NextResponse.json({
      chart: serializeChart(chart, {
        authorRole: chart.user?.profile?.role || chart.user?.role || undefined,
        authorNickname: chart.user?.profile?.nickname || (chart.user?.profile as any)?.display_name || undefined,
        authorEmail: chart.user?.email || undefined,
      }),
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    console.error('chart play count increment error', error);
    return NextResponse.json({ error: 'failed to increment play count' }, { status: 500 });
  }
}

