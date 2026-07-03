import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { logAdminAuthFailure, requireAdmin } from '../../../lib/requireAdmin';

export const runtime = 'nodejs';

const NOTICE_ID = 'main-notice';
const DEFAULT_NOTICE = {
  title: 'v1.2.2 업데이트: 선택 영역 이동 모드 추가!',
  content:
    '안녕하세요! UseRhythm v1.2.2가 출시되었습니다.\n\n✨ 주요 변경사항\n\n• 선택 영역 이동 모드 추가\n  - 선택된 노트를 드래그하여 시간과 레인을 쉽게 변경할 수 있습니다\n  - 사이드바의 "선택 영역 이동 모드" 버튼을 클릭하여 활성화하세요\n  - 노트를 이동하면 선택 영역도 함께 이동하여 편집이 더욱 편리해집니다\n\n• 레인별 분할 선택 모드 제거\n  - 사용 빈도가 낮아 기능을 제거하고 UI를 간소화했습니다\n\n• 이동 모드에서 노트 삭제 방지\n  - 이동 모드가 활성화되어 있을 때 실수로 노트를 삭제하는 것을 방지합니다\n\n더 나은 채보 편집 경험을 위해 계속 개선하고 있습니다. 피드백은 언제든 환영합니다! 🎵',
};

export async function GET(_req: NextRequest) {
  try {
    let notice = await prisma.notice.findUnique({
      where: { id: NOTICE_ID },
    });

    if (!notice) {
      try {
        notice = await prisma.notice.create({
          data: {
            id: NOTICE_ID,
            ...DEFAULT_NOTICE,
          },
        });
      } catch (createError: any) {
        if (createError?.code === 'P2002') {
          notice = await prisma.notice.findUnique({ where: { id: NOTICE_ID } });
        }
        if (!notice) throw createError;
      }
    }

    return NextResponse.json({
      title: notice.title,
      content: notice.content,
      updatedAt: notice.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('notice get error', error);
    return NextResponse.json({
      title: '공지사항',
      content: '공지사항을 불러올 수 없습니다.\n\nAPI 서버가 실행 중인지 확인해주세요.',
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req, { allowModerator: false });
    if (!admin.ok) {
      logAdminAuthFailure('notice update', admin);
      return NextResponse.json({ error: 'unauthorized', message: '관리자 권한이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 });
    }

    const { title, content } = body as { title?: unknown; content?: unknown };
    if (typeof title !== 'string' || typeof content !== 'string' || !title.trim() || !content.trim()) {
      return NextResponse.json({ error: 'title_and_content_required' }, { status: 400 });
    }

    const notice = await prisma.notice.upsert({
      where: { id: NOTICE_ID },
      update: {
        title: title.trim(),
        content: content.trim(),
      },
      create: {
        id: NOTICE_ID,
        title: title.trim(),
        content: content.trim(),
      },
    });

    return NextResponse.json({
      title: notice.title,
      content: notice.content,
      updatedAt: notice.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('notice update error', error);
    return NextResponse.json(
      {
        error: 'failed to update notice',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
