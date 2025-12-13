import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// 간단한 인메모리 저장 (프로덕션에서는 DB 사용 권장)
let versionData = {
  version: '1.2.1',
  changelog: [
    '채보 에디터 드래그 선택 기능 추가 - 타임라인에서 영역을 드래그하여 노트 선택 가능',
    '복사/붙여넣기 기능 추가 - Ctrl+C로 선택된 노트 복사, Ctrl+V로 현재 위치에 붙여넣기',
    '실행 취소/다시 실행 기능 추가 - Ctrl+Z로 실행 취소, Ctrl+Y 또는 Ctrl+Shift+Z로 다시 실행',
    '선택 모드 토글 버튼 추가 - 롱노트 모드처럼 버튼으로 선택 모드 켜기/끄기',
    '레인별 분할 선택 모드 추가 - 특정 레인의 노트만 선택하여 복사 가능',
    '선택 영역 시각화 개선 - 선택된 영역을 파란색 반투명 박스로 표시',
    '사이드바 UI 개선 - 너비 확대 및 폰트 크기 최적화로 더 많은 내용 표시',
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

