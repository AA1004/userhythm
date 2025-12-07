import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    status: 'Server is running', 
    env_check: process.env.DATABASE_URL ? 'DB_URL_SET' : 'DB_URL_MISSING' 
  });
}
