import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { logAdminAuthFailure, requireAdmin } from '../../../../../lib/requireAdmin';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      logAdminAuthFailure('chart status update', admin);
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { status, comment } = await req.json();
    if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    const updated = await prisma.chart.update({
      where: { id: params.id },
      data: { status },
    });

    // 간단한 review 로그 남기려면 chart_reviews 모델 추가 후 insert 가능 (현재는 생략)

    return NextResponse.json({ chart: updated });
  } catch (error) {
    console.error('update chart status error', error);
    return NextResponse.json({ error: 'failed to update status' }, { status: 500 });
  }
}

