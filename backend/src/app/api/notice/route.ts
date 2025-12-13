import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// 간단한 인메모리 저장 (프로덕션에서는 DB 사용 권장)
let noticeData = {
  title: '공지사항',
  content: 'UseRhythm에 오신 것을 환영합니다!\n\n새로운 기능과 업데이트를 확인하세요.',
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

