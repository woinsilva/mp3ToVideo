CREATE TYPE "ChildrenClipShotRenderStatus" AS ENUM ('queued', 'rendering', 'completed', 'failed');

CREATE TABLE "ChildrenClipShotRenderAttempt" (
  "id" TEXT NOT NULL,
  "shotId" TEXT NOT NULL,
  "assetId" TEXT,
  "attemptNumber" INTEGER NOT NULL,
  "status" "ChildrenClipShotRenderStatus" NOT NULL DEFAULT 'queued',
  "bullJobId" TEXT,
  "fps" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "frameCount" INTEGER NOT NULL,
  "renderManifest" JSONB,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "stage" TEXT,
  "errorMessage" TEXT,
  "renderStartedAt" TIMESTAMP(3),
  "renderCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildrenClipShotRenderAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildrenClipShotRenderAttempt_assetId_key" ON "ChildrenClipShotRenderAttempt"("assetId");
CREATE UNIQUE INDEX "ChildrenClipShotRenderAttempt_shotId_attemptNumber_key" ON "ChildrenClipShotRenderAttempt"("shotId", "attemptNumber");
CREATE INDEX "ChildrenClipShotRenderAttempt_shotId_status_idx" ON "ChildrenClipShotRenderAttempt"("shotId", "status");
CREATE INDEX "ChildrenClipShotRenderAttempt_bullJobId_idx" ON "ChildrenClipShotRenderAttempt"("bullJobId");
ALTER TABLE "ChildrenClipShotRenderAttempt" ADD CONSTRAINT "ChildrenClipShotRenderAttempt_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "ChildrenClipShot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipShotRenderAttempt" ADD CONSTRAINT "ChildrenClipShotRenderAttempt_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
