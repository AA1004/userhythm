import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const sortBy = (searchParams.get('sortBy') || 'created_at') as 'created_at' | 'play_count' | 'title';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const limit = Math.min(parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    const where = search
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
      }),
      prisma.chart.count({ where }),
    ]);

    return NextResponse.json({ charts: items, total });
  } catch (error) {
    console.error('charts list error', error);
    return NextResponse.json({ error: 'failed to load charts' }, { status: 500 });
  }
}

