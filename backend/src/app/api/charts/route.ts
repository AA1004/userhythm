import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getSessionFromRequest } from '../../../lib/auth';
import { Chart } from '@prisma/client';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_DATA_JSON_LENGTH = 200_000; // ~200KB
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_DIFFICULTY_LENGTH = 50;

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const sortBy = (searchParams.get('sortBy') || 'created_at') as 'created_at' | 'play_count' | 'title';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const limit = Math.min(parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const where: any = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { author: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const orderBy =
      sortBy === 'play_count'
        ? { playCount: sortOrder }
        : sortBy === 'title'
        ? { title: sortOrder }
        : { createdAt: sortOrder };

    const [items, total] = await Promise.all([
      prisma.chart.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: { user: { include: { profile: true } } },
      }),
      prisma.chart.count({ where }),
    ]);

    const serialized = items.map((c) =>
      serializeChart(c, {
        authorRole: c.user?.profile?.role || c.user?.role || null,
        authorNickname: c.user?.profile?.nickname || (c.user?.profile as any)?.display_name || null,
        authorEmail: c.user?.email || null,
      })
    );

    return NextResponse.json({ charts: serialized, total });
  } catch (error) {
    console.error('charts list error', error);
    return NextResponse.json({ error: 'failed to load charts' }, { status: 500 });
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

    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { profile: true },
    });
    if (!dbUser) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 401 });
    }

    const author =
      dbUser.profile?.nickname ||
      // display_name 호환 (있다면)
      (dbUser.profile as any)?.display_name ||
      (dbUser.email ? dbUser.email.split('@')[0] : 'unknown');

    const chart = await prisma.chart.create({
      data: {
        title: trimmedTitle,
        author,
        bpm: bpmNumber,
        difficulty: trimmedDifficulty,
        description: trimmedDescription,
        youtubeUrl: trimmedYoutubeUrl,
        previewImage: trimmedPreviewImage,
        dataJson,
        userId: dbUser.id,
        // status는 prisma schema default("pending") 사용
      },
    });

    return NextResponse.json(
      {
        chart: serializeChart(chart, {
          authorRole: dbUser.profile?.role || dbUser.role || null,
          authorNickname: dbUser.profile?.nickname || (dbUser.profile as any)?.display_name || null,
          authorEmail: dbUser.email || null,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('charts create error', error);
    return NextResponse.json({ error: 'failed to create chart' }, { status: 500 });
  }
}

