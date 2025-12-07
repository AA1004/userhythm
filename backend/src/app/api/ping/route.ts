export async function GET() {
  // 가장 단순한 핑 엔드포인트 (NextResponse도 안 씀)
  return new Response('pong', { status: 200 });
}

