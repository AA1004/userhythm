import { NextResponse } from 'next/server';

// Node 런타임 강제 + 오류를 응답 본문에 담아 디버깅
export const runtime = 'nodejs';

export async function GET() {
  const now = new Date().toISOString();
  try {
    console.log('[health] hit', now);
    return NextResponse.json({ ok: true, at: now });
  } catch (error: any) {
    console.error('[health] error', error);
    return NextResponse.json(
      {
        error: error?.message || 'unknown',
        stack: error?.stack || '',
        at: now,
      },
      { status: 500 }
    );
  }
}
