import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getSessionFromRequest } from '../../../lib/auth';

export const runtime = 'nodejs';

// 단일 버전 ID (항상 같은 레코드를 사용)
const VERSION_ID = 'main-version';

export async function GET() {
  try {
    // 기존 버전이 있으면 반환, 없으면 기본값 생성
    let version = await prisma.version.findUnique({
      where: { id: VERSION_ID },
    });

    if (!version) {
      try {
        // 기본 버전 생성 (동시 요청 시 중복 생성 방지)
        const defaultChangelog = [
          '선택 영역 이동 모드 추가 - 선택된 노트를 드래그하여 시간과 레인을 변경할 수 있는 기능',
          '노트 이동 시 선택 영역 동기화 - 노트를 이동하면 선택 영역도 함께 이동하여 편집 편의성 향상',
          '레인별 분할 선택 모드 제거 - 사용 빈도가 낮아 기능 제거 및 UI 간소화',
          '이동 모드에서 노트 삭제 방지 - 실수로 노트를 삭제하는 것을 방지',
          '선택 영역 이동 모드 버튼 추가 - 사이드바에서 이동 모드를 쉽게 켜고 끌 수 있음',
        ];
        version = await prisma.version.create({
          data: {
            id: VERSION_ID,
            version: '1.2.3',
            changelog: JSON.stringify(defaultChangelog),
          },
        });
      } catch (createError: any) {
        // 이미 생성되었을 수 있으므로 다시 조회
        if (createError?.code === 'P2002') {
          version = await prisma.version.findUnique({
            where: { id: VERSION_ID },
          });
        }
        if (!version) {
          throw createError;
        }
      }
    }

    if (!version) {
      throw new Error('Failed to create or retrieve version');
    }

    // changelog 파싱 시도 (안전하게)
    let changelogArray: string[] = [];
    try {
      changelogArray = JSON.parse(version.changelog) as string[];
      if (!Array.isArray(changelogArray)) {
        changelogArray = ['버전 정보 형식 오류'];
      }
    } catch (parseError) {
      console.error('Failed to parse changelog:', parseError);
      changelogArray = ['버전 정보를 파싱할 수 없습니다.'];
    }

    return NextResponse.json({
      version: version.version,
      changelog: changelogArray,
      updatedAt: version.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('version get error', error);
    console.error('Error details:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    // 모든 에러에 대해 기본값 반환 (GET 요청은 항상 성공해야 함)
    return NextResponse.json({
      version: '1.0.0',
      changelog: ['버전 정보를 불러올 수 없습니다.', 'API 서버가 실행 중인지 확인해주세요.'],
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    // ADMIN 권한 체크
    const session = getSessionFromRequest(req);
    if (!session || session.role !== 'admin') {
      console.warn('Version update unauthorized:', { session: session ? { userId: session.userId, role: session.role } : null });
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { version, changelog } = body;
    
    if (!version || !Array.isArray(changelog)) {
      console.warn('Version update missing fields:', { version: !!version, changelog: Array.isArray(changelog) });
      return NextResponse.json(
        { error: 'version and changelog array are required' },
        { status: 400 }
      );
    }

    // upsert로 업데이트 (없으면 생성)
    const versionData = await prisma.version.upsert({
      where: { id: VERSION_ID },
      update: {
        version,
        changelog: JSON.stringify(changelog),
      },
      create: {
        id: VERSION_ID,
        version,
        changelog: JSON.stringify(changelog),
      },
    });

    // changelog 파싱 시도 (안전하게)
    let changelogArray: string[] = [];
    try {
      changelogArray = JSON.parse(versionData.changelog) as string[];
      if (!Array.isArray(changelogArray)) {
        changelogArray = [];
      }
    } catch (parseError) {
      console.error('Failed to parse changelog:', parseError);
      changelogArray = [];
    }

    console.log('Version updated successfully:', { id: versionData.id, version: versionData.version });
    return NextResponse.json({
      version: versionData.version,
      changelog: changelogArray,
      updatedAt: versionData.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('version update error', error);
    console.error('Error details:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      { 
        error: 'failed to update version',
        details: (process.env.NODE_ENV as string) === 'development' ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}

