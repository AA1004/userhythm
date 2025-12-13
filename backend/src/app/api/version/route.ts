import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// 간단한 인메모리 저장 (프로덕션에서는 DB 사용 권장)
let versionData = {
  version: '1.2.2',
  changelog: [
    '선택 영역 이동 모드 추가 - 선택된 노트를 드래그하여 시간과 레인을 변경할 수 있는 기능',
    '노트 이동 시 선택 영역 동기화 - 노트를 이동하면 선택 영역도 함께 이동하여 편집 편의성 향상',
    '레인별 분할 선택 모드 제거 - 사용 빈도가 낮아 기능 제거 및 UI 간소화',
    '이동 모드에서 노트 삭제 방지 - 실수로 노트를 삭제하는 것을 방지',
    '선택 영역 이동 모드 버튼 추가 - 사이드바에서 이동 모드를 쉽게 켜고 끌 수 있음',
  ],
  updatedAt: new Date().toISOString(),
};

export async function GET() {
  try {
    return NextResponse.json(versionData);
  } catch (error) {
    console.error('version get error', error);
    return NextResponse.json(
      { error: 'failed to load version' },
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

    const { version, changelog } = await req.json();
    if (!version || !Array.isArray(changelog)) {
      return NextResponse.json(
        { error: 'version and changelog array are required' },
        { status: 400 }
      );
    }

    versionData = {
      version,
      changelog,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(versionData);
  } catch (error) {
    console.error('version update error', error);
    return NextResponse.json(
      { error: 'failed to update version' },
      { status: 500 }
    );
  }
}

