-- Promote chart metadata that used to be inferred from dataJson into indexed columns.
ALTER TABLE "Chart"
  ADD COLUMN "adminDifficulty" TEXT,
  ADD COLUMN "isWorkInProgress" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Chart"
SET "adminDifficulty" = LEFT(NULLIF(TRIM("dataJson"::jsonb ->> 'adminDifficulty'), ''), 50)
WHERE "dataJson"::jsonb ? 'adminDifficulty';

UPDATE "Chart"
SET "isWorkInProgress" = CASE
  WHEN LOWER(COALESCE("dataJson"::jsonb #>> '{wip,enabled}', 'false')) = 'true' THEN true
  ELSE false
END
WHERE "dataJson"::jsonb ? 'wip';

CREATE INDEX "Chart_status_isWorkInProgress_createdAt_idx"
  ON "Chart"("status", "isWorkInProgress", "createdAt");

CREATE INDEX "Chart_status_isWorkInProgress_playCount_idx"
  ON "Chart"("status", "isWorkInProgress", "playCount");

CREATE INDEX "Chart_status_isWorkInProgress_title_idx"
  ON "Chart"("status", "isWorkInProgress", "title");
