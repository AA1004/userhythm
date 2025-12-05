// Prisma 런타임 엔진을 명시적으로 라이브러리 모드로 사용하고,
// 드라이버 어댑터(pg)를 통해 연결한다.
process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library';
process.env.PRISMA_GENERATE_ENGINE = 'library';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma =
  global.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

