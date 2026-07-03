import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const MIGRATION_NAME = '20260703010000_normalize_chart_metadata';
const prisma = new PrismaClient();
const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, '..');

const log = (message) => {
  console.log(`[migration-repair] ${message}`);
};

const getFailedMigration = async () => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME}
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    if (row.finished_at || row.rolled_back_at) return null;
    return row;
  } catch (error) {
    log(`skipping repair check: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const repairSchema = async () => {
  log('applying idempotent schema repair');

  await prisma.$executeRawUnsafe('ALTER TABLE "Chart" ADD COLUMN IF NOT EXISTS "adminDifficulty" TEXT');
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Chart" ADD COLUMN IF NOT EXISTS "isWorkInProgress" BOOLEAN NOT NULL DEFAULT false'
  );
  await prisma.$executeRawUnsafe('ALTER TABLE "Chart" ALTER COLUMN "isWorkInProgress" SET DEFAULT false');
  await prisma.$executeRawUnsafe('UPDATE "Chart" SET "isWorkInProgress" = false WHERE "isWorkInProgress" IS NULL');
  await prisma.$executeRawUnsafe('ALTER TABLE "Chart" ALTER COLUMN "isWorkInProgress" SET NOT NULL');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public."userhythm_try_jsonb"(value text)
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN value::jsonb;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    $$
  `);

  await prisma.$executeRawUnsafe(`
    WITH parsed AS (
      SELECT id, public."userhythm_try_jsonb"("dataJson") AS data
      FROM "Chart"
    )
    UPDATE "Chart" AS chart
    SET "adminDifficulty" = LEFT(NULLIF(TRIM(parsed.data ->> 'adminDifficulty'), ''), 50)
    FROM parsed
    WHERE chart.id = parsed.id
      AND parsed.data IS NOT NULL
      AND parsed.data ? 'adminDifficulty'
  `);

  await prisma.$executeRawUnsafe(`
    WITH parsed AS (
      SELECT id, public."userhythm_try_jsonb"("dataJson") AS data
      FROM "Chart"
    )
    UPDATE "Chart" AS chart
    SET "isWorkInProgress" =
      CASE
        WHEN LOWER(COALESCE(parsed.data #>> '{wip,enabled}', 'false')) = 'true' THEN true
        ELSE chart."isWorkInProgress"
      END
    FROM parsed
    WHERE chart.id = parsed.id
      AND parsed.data IS NOT NULL
      AND parsed.data ? 'wip'
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Chart_status_isWorkInProgress_createdAt_idx"
    ON "Chart"("status", "isWorkInProgress", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Chart_status_isWorkInProgress_playCount_idx"
    ON "Chart"("status", "isWorkInProgress", "playCount")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Chart_status_isWorkInProgress_title_idx"
    ON "Chart"("status", "isWorkInProgress", "title")
  `);

  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS public."userhythm_try_jsonb"(text)');
};

const markMigrationApplied = () => {
  log(`marking ${MIGRATION_NAME} as applied`);
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    npxCommand,
    ['prisma', 'migrate', 'resolve', '--applied', MIGRATION_NAME],
    {
      cwd: backendDir,
      stdio: 'inherit',
      env: process.env,
    }
  );

  if (result.status !== 0) {
    throw new Error(`prisma migrate resolve failed with status ${result.status}`);
  }
};

try {
  const failedMigration = await getFailedMigration();
  if (!failedMigration) {
    log('no failed normalize chart metadata migration found');
  } else {
    log(`detected failed migration ${MIGRATION_NAME}`);
    await repairSchema();
    await prisma.$disconnect();
    markMigrationApplied();
    log('repair complete');
  }
} catch (error) {
  await prisma.$disconnect().catch(() => {});
  console.error('[migration-repair] repair failed', error);
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
