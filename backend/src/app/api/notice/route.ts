import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// 간단한 인메모리 저장 (프로덕션에서는 DB 사용 권장)
let noticeData = {
  title: 'v1.2.2 업데이트: 선택 영역 이동 모드 추가!',
  content: '안녕하세요! UseRhythm v1.2.2가 출시되었습니다.\n\n✨ 주요 변경사항\n\n• 선택 영역 이동 모드 추가\n  - 선택된 노트를 드래그하여 시간과 레인을 쉽게 변경할 수 있습니다\n  - 사이드바의 "선택 영역 이동 모드" 버튼을 클릭하여 활성화하세요\n  - 노트를 이동하면 선택 영역도 함께 이동하여 편집이 더욱 편리해집니다\n\n• 레인별 분할 선택 모드 제거\n  - 사용 빈도가 낮아 기능을 제거하고 UI를 간소화했습니다\n\n• 이동 모드에서 노트 삭제 방지\n  - 이동 모드가 활성화되어 있을 때 실수로 노트를 삭제하는 것을 방지합니다\n\n더 나은 채보 편집 경험을 위해 계속 개선하고 있습니다. 피드백은 언제든 환영합니다! 🎵',
  updatedAt: new Date().toISOString(),
};

export async function GET() {
  try {
    return NextResponse.json(noticeData);
  } catch (error) {
    console.error('notice get error', error);
    return NextResponse.json(
      { error: 'failed to load notice' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-admin-token') || '';
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { title, content } = await req.json();
    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    noticeData = {
      title,
      content,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(noticeData);
  } catch (error) {
    console.error('notice update error', error);
    return NextResponse.json(
      { error: 'failed to update notice' },
      { status: 500 }
    );
  }
}

