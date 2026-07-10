CREATE TABLE "PlaySession" (
  "nonce" TEXT NOT NULL,
  "userId" TEXT,
  "chartId" TEXT NOT NULL,
  "chartHash" TEXT NOT NULL,
  "expectedJudgments" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "countedAt" TIMESTAMP(3),
  "scoreConsumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("nonce")
);

CREATE INDEX "PlaySession_expiresAt_idx" ON "PlaySession"("expiresAt");
CREATE INDEX "PlaySession_chartId_idx" ON "PlaySession"("chartId");
CREATE INDEX "PlaySession_userId_idx" ON "PlaySession"("userId");

ALTER TABLE "PlaySession"
  ADD CONSTRAINT "PlaySession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlaySession"
  ADD CONSTRAINT "PlaySession_chartId_fkey"
  FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
