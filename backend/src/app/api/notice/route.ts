import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getSessionFromRequest } from '../../../lib/auth';

export const runtime = 'nodejs';

// 단일 공지사항 ID (항상 같은 레코드를 사용)
const NOTICE_ID = 'main-notice';

export async function GET() {
  try {
    // 기존 공지사항이 있으면 반환, 없으면 기본값 생성
    let notice = await prisma.notice.findUnique({
      where: { id: NOTICE_ID },
    });

    if (!notice) {
      // 기본 공지사항 생성
      notice = await prisma.notice.create({
        data: {
          id: NOTICE_ID,
          title: 'v1.2.2 업데이트: 선택 영역 이동 모드 추가!',
          content: '안녕하세요! UseRhythm v1.2.2가 출시되었습니다.\n\n✨ 주요 변경사항\n\n• 선택 영역 이동 모드 추가\n  - 선택된 노트를 드래그하여 시간과 레인을 쉽게 변경할 수 있습니다\n  - 사이드바의 "선택 영역 이동 모드" 버튼을 클릭하여 활성화하세요\n  - 노트를 이동하면 선택 영역도 함께 이동하여 편집이 더욱 편리해집니다\n\n• 레인별 분할 선택 모드 제거\n  - 사용 빈도가 낮아 기능을 제거하고 UI를 간소화했습니다\n\n• 이동 모드에서 노트 삭제 방지\n  - 이동 모드가 활성화되어 있을 때 실수로 노트를 삭제하는 것을 방지합니다\n\n더 나은 채보 편집 경험을 위해 계속 개선하고 있습니다. 피드백은 언제든 환영합니다! 🎵',
        },
      });
    }

    return NextResponse.json({
      title: notice.title,
      content: notice.content,
      updatedAt: notice.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('notice get error', error);
    // DB 연결 실패 시 기본값 반환
    if (error?.name === 'PrismaClientInitializationError' || process.env.NODE_ENV === 'development') {
      return NextResponse.json({
        title: '공지사항',
        content: '공지사항을 불러올 수 없습니다.\n\nAPI 서버가 실행 중인지 확인해주세요.',
        updatedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json(
      { error: 'failed to load notice' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // ADMIN 권한 체크
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { title, content } = await req.json();
    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    // upsert로 업데이트 (없으면 생성)
    const notice = await prisma.notice.upsert({
      where: { id: NOTICE_ID },
      update: {
        title,
        content,
      },
      create: {
        id: NOTICE_ID,
        title,
        content,
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
      { error: 'failed to update notice' },
      { status: 500 }
    );
  }
}

