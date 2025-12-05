import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

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

    return NextResponse.json({ charts });
  } catch (error) {
    console.error('pending charts error', error);
    return NextResponse.json({ error: 'failed to load pending charts' }, { status: 500 });
  }
}

