import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  // eslint-disable-next-line no-unused-var
  var prisma: PrismaClient | undefined;
}

// DATABASE_URL이 없으면 명확한 에러 메시지 표시
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('Please set DATABASE_URL in your .env file or environment variables.');
  console.error('Example: DATABASE_URL="postgresql://user:password@localhost:5432/dbname"');
}

export const prisma =
  global.prisma ||
  // Prisma 5.21.1 타입 정의가 옵션 객체를 강제하므로, 빈 옵션을 any로 캐스팅해 전달한다.
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  } as any);

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
