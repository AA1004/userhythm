import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getSessionFromRequest } from '../../../lib/auth';

export const runtime = 'nodejs';

// 단일 버전 ID (항상 같은 레코드를 사용)
const VERSION_ID = 'main-version';

export async function GET(req: NextRequest) {
  try {
    // 디버깅: GET 요청 정보 로깅
    const cookies = req.cookies.getAll();
    console.log('Version GET request:', {
      url: req.url,
      method: req.method,
      cookieNames: cookies.map(c => c.name),
      hasUrSession: !!req.cookies.get('ur_session'),
    });
    
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
    const cookies = req.cookies.getAll();
    console.log('Version update request:', {
      hasSession: !!session,
      sessionRole: session?.role,
      sessionUserId: session?.userId,
      cookieNames: cookies.map(c => c.name),
      hasUrSession: !!req.cookies.get('ur_session'),
    });
    
    const urSessionCookie = req.cookies.get('ur_session');
    
    console.log('Version update request:', {
      hasSession: !!session,
      sessionRole: session?.role,
      sessionUserId: session?.userId,
      cookieNames: cookies.map(c => c.name),
      hasUrSession: !!urSessionCookie,
      urSessionValue: urSessionCookie ? `${urSessionCookie.value.substring(0, 20)}...` : 'none',
      requestHeaders: {
        host: req.headers.get('host'),
        origin: req.headers.get('origin'),
        referer: req.headers.get('referer'),
        cookie: req.headers.get('cookie') ? 'present' : 'missing',
      },
    });
    
    if (!session) {
      console.warn('Version update unauthorized: No session', {
        cookieNames: cookies.map(c => c.name),
        cookieValues: cookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })),
        urSessionCookie: urSessionCookie ? urSessionCookie.value.substring(0, 20) + '...' : 'missing',
        requestHeaders: {
          host: req.headers.get('host'),
          origin: req.headers.get('origin'),
          cookie: req.headers.get('cookie'),
        },
      });
      return NextResponse.json({ 
        error: 'unauthorized',
        message: '세션이 없습니다. 로그인이 필요합니다.',
        details: 'Please log in first. Check if ur_session cookie is being sent.'
      }, { status: 401 });
    }
    
    // DB에서 실제 role 확인 (세션의 role과 일치하는지 확인)
    let dbUser = null;
    try {
      dbUser = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { profile: true },
      });
    } catch (dbError) {
      console.error('Failed to fetch user from DB:', dbError);
    }
    
    const effectiveRole = dbUser?.profile?.role || dbUser?.role || session.role;
    
    console.log('Role check:', {
      userId: session.userId,
      sessionRole: session.role,
      dbUserRole: dbUser?.role,
      dbProfileRole: dbUser?.profile?.role,
      effectiveRole,
    });
    
    // effectiveRole이 admin이 아니면 거부
    if (effectiveRole !== 'admin') {
      console.warn('Version update unauthorized: Not admin', {
        userId: session.userId,
        sessionRole: session.role,
        dbUserRole: dbUser?.role,
        dbProfileRole: dbUser?.profile?.role,
        effectiveRole,
        expectedRole: 'admin',
      });
      return NextResponse.json({ 
        error: 'unauthorized',
        message: '관리자 권한이 필요합니다.',
        details: `Session role: ${session.role}, DB role: ${dbUser?.role || 'N/A'}, Profile role: ${dbUser?.profile?.role || 'N/A'}, Effective: ${effectiveRole}, Required: admin`
      }, { status: 401 });
    }
    
    // 세션 role이 admin이 아니지만 DB에서 admin인 경우 경고 (권한은 허용)
    if (effectiveRole === 'admin' && session.role !== 'admin') {
      console.warn('Session role mismatch: session has', session.role, 'but DB has', effectiveRole, '- user needs to re-login');
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

