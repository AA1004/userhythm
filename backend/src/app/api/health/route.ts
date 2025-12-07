import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  console.log('[health] hit', new Date().toISOString());
  return NextResponse.json({ ok: true });
}
