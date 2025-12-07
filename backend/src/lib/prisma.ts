import { PrismaClient } from '../../generated/prisma/client';

declare global {
  // eslint-disable-next-line no-var
  // eslint-disable-next-line no-unused-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  // Prisma 5.21.1 타입 정의가 옵션 객체를 강제하므로, 빈 옵션을 any로 캐스팅해 전달한다.
  new PrismaClient({} as any);

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
