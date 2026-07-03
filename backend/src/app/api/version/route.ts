import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { logAdminAuthFailure, requireAdmin } from '../../../lib/requireAdmin';

export const runtime = 'nodejs';

const VERSION_ID = 'main-version';
const DEFAULT_CHANGELOG = [
  '선택 영역 이동 모드 추가 - 선택된 노트를 드래그하여 시간과 레인을 변경할 수 있는 기능',
  '노트 이동 시 선택 영역 동기화 - 노트를 이동하면 선택 영역도 함께 이동하여 편집 편의성 향상',
  '레인별 분할 선택 모드 제거 - 사용 빈도가 낮아 기능 제거 및 UI 간소화',
  '이동 모드에서 노트 삭제 방지 - 실수로 노트를 삭제하는 것을 방지',
  '선택 영역 이동 모드 버튼 추가 - 사이드바에서 이동 모드를 쉽게 켜고 끌 수 있음',
];

const parseChangelog = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : ['버전 정보 형식 오류'];
  } catch {
    return ['버전 정보를 파싱할 수 없습니다.'];
  }
};

export async function GET(_req: NextRequest) {
  try {
    let version = await prisma.version.findUnique({
      where: { id: VERSION_ID },
    });

    if (!version) {
      try {
        version = await prisma.version.create({
          data: {
            id: VERSION_ID,
            version: '1.2.3',
            changelog: JSON.stringify(DEFAULT_CHANGELOG),
          },
        });
      } catch (createError: any) {
        if (createError?.code === 'P2002') {
          version = await prisma.version.findUnique({ where: { id: VERSION_ID } });
        }
        if (!version) throw createError;
      }
    }

    return NextResponse.json({
      version: version.version,
      changelog: parseChangelog(version.changelog),
      updatedAt: version.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('version get error', error);
    return NextResponse.json({
      version: '1.0.0',
      changelog: ['버전 정보를 불러올 수 없습니다.', 'API 서버가 실행 중인지 확인해주세요.'],
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      logAdminAuthFailure('version update', admin);
      return NextResponse.json({ error: 'unauthorized', message: '관리자 권한이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 });
    }

    const { version, changelog } = body as { version?: unknown; changelog?: unknown };
    if (typeof version !== 'string' || !version.trim() || !Array.isArray(changelog)) {
      return NextResponse.json({ error: 'version_and_changelog_required' }, { status: 400 });
    }

    const normalizedChangelog = changelog.map(String);
    const versionData = await prisma.version.upsert({
      where: { id: VERSION_ID },
      update: {
        version: version.trim(),
        changelog: JSON.stringify(normalizedChangelog),
      },
      create: {
        id: VERSION_ID,
        version: version.trim(),
        changelog: JSON.stringify(normalizedChangelog),
      },
    });

    return NextResponse.json({
      version: versionData.version,
      changelog: parseChangelog(versionData.changelog),
      updatedAt: versionData.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('version update error', error);
    return NextResponse.json(
      {
        error: 'failed to update version',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
