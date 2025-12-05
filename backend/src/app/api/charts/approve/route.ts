import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-admin-token') || '';
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id, status, comment } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    const updated = await prisma.chart.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ chart: updated });
  } catch (error) {
    console.error('approve endpoint error', error);
    return NextResponse.json({ error: 'failed to update status' }, { status: 500 });
  }
}

