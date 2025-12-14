import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getSessionFromRequest } from '../../../lib/auth';

export const runtime = 'nodejs';

// 단일 공지사항 ID (항상 같은 레코드를 사용)
const NOTICE_ID = 'main-notice';

export async function GET(req: NextRequest) {
  try {
    // 디버깅: GET 요청 정보 로깅
    const cookies = req.cookies.getAll();
    console.log('Notice GET request:', {
      url: req.url,
      method: req.method,
      cookieNames: cookies.map(c => c.name),
      hasUrSession: !!req.cookies.get('ur_session'),
    });
    
    // 기존 공지사항이 있으면 반환, 없으면 기본값 생성
    let notice = await prisma.notice.findUnique({
      where: { id: NOTICE_ID },
    });

    if (!notice) {
      try {
        // 기본 공지사항 생성 (동시 요청 시 중복 생성 방지)
        notice = await prisma.notice.create({
          data: {
            id: NOTICE_ID,
            title: 'v1.2.2 업데이트: 선택 영역 이동 모드 추가!',
            content: '안녕하세요! UseRhythm v1.2.2가 출시되었습니다.\n\n✨ 주요 변경사항\n\n• 선택 영역 이동 모드 추가\n  - 선택된 노트를 드래그하여 시간과 레인을 쉽게 변경할 수 있습니다\n  - 사이드바의 "선택 영역 이동 모드" 버튼을 클릭하여 활성화하세요\n  - 노트를 이동하면 선택 영역도 함께 이동하여 편집이 더욱 편리해집니다\n\n• 레인별 분할 선택 모드 제거\n  - 사용 빈도가 낮아 기능을 제거하고 UI를 간소화했습니다\n\n• 이동 모드에서 노트 삭제 방지\n  - 이동 모드가 활성화되어 있을 때 실수로 노트를 삭제하는 것을 방지합니다\n\n더 나은 채보 편집 경험을 위해 계속 개선하고 있습니다. 피드백은 언제든 환영합니다! 🎵',
          },
        });
      } catch (createError: any) {
        // 이미 생성되었을 수 있으므로 다시 조회
        if (createError?.code === 'P2002') {
          notice = await prisma.notice.findUnique({
            where: { id: NOTICE_ID },
          });
        }
        if (!notice) {
          throw createError;
        }
      }
    }

    if (!notice) {
      throw new Error('Failed to create or retrieve notice');
    }

    return NextResponse.json({
      title: notice.title,
      content: notice.content,
      updatedAt: notice.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('notice get error', error);
    console.error('Error details:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    // 모든 에러에 대해 기본값 반환 (GET 요청은 항상 성공해야 함)
    return NextResponse.json({
      title: '공지사항',
      content: '공지사항을 불러올 수 없습니다.\n\nAPI 서버가 실행 중인지 확인해주세요.',
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    // ADMIN 권한 체크
    const session = getSessionFromRequest(req);
    const cookies = req.cookies.getAll();
    const urSessionCookie = req.cookies.get('ur_session');
    
    console.log('Notice update request:', {
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
      console.warn('Notice update unauthorized: No session', {
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
      console.warn('Notice update unauthorized: Not admin', {
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

    let body;
    try {
      body = await req.json();
    } catch (parseError: any) {
      console.error('Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'invalid request body', details: 'JSON 파싱에 실패했습니다.' },
        { status: 400 }
      );
    }

    const { title, content } = body;
    
    if (!title || !content) {
      console.warn('Notice update missing fields:', { title: !!title, content: !!content, bodyKeys: Object.keys(body || {}) });
      return NextResponse.json(
        { error: 'title and content are required', details: `제목: ${!!title}, 내용: ${!!content}` },
        { status: 400 }
      );
    }

    // 문자열 길이 검증
    if (typeof title !== 'string' || typeof content !== 'string') {
      console.warn('Notice update invalid field types:', { titleType: typeof title, contentType: typeof content });
      return NextResponse.json(
        { error: 'title and content must be strings' },
        { status: 400 }
      );
    }

    // upsert로 업데이트 (없으면 생성)
    let notice;
    try {
      notice = await prisma.notice.upsert({
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
    } catch (prismaError: any) {
      console.error('Prisma upsert error:', {
        code: prismaError?.code,
        message: prismaError?.message,
        meta: prismaError?.meta,
      });
      throw prismaError;
    }

    console.log('Notice updated successfully:', { id: notice.id, title: notice.title, contentLength: notice.content.length });
    return NextResponse.json({
      title: notice.title,
      content: notice.content,
      updatedAt: notice.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('notice update error', error);
    console.error('Error details:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
    
    // 더 자세한 에러 메시지 반환
    const errorMessage = error?.message || '알 수 없는 오류가 발생했습니다.';
    const errorCode = error?.code || 'UNKNOWN';
    
    return NextResponse.json(
      { 
        error: 'failed to update notice',
        message: errorMessage,
        code: errorCode,
        details: (process.env.NODE_ENV as string) === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}

