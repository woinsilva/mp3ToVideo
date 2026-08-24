CREATE TYPE "ChildrenClipHeroShotStatus" AS ENUM ('queued', 'generating', 'validating', 'ready_for_review', 'approved', 'failed');
CREATE TYPE "ChildrenClipFinalRenderStatus" AS ENUM ('queued', 'compositing', 'encoding', 'validating', 'completed', 'failed');

CREATE TABLE "ChildrenClipHeroShotAttempt" (
  "id" TEXT NOT NULL, "shotId" TEXT NOT NULL, "assetId" TEXT, "attemptNumber" INTEGER NOT NULL,
  "status" "ChildrenClipHeroShotStatus" NOT NULL DEFAULT 'queued', "bullJobId" TEXT, "promptId" TEXT,
  "seed" INTEGER NOT NULL, "fps" INTEGER NOT NULL, "width" INTEGER NOT NULL, "height" INTEGER NOT NULL,
  "frameCount" INTEGER NOT NULL, "generationManifest" JSONB, "progress" INTEGER NOT NULL DEFAULT 0,
  "stage" TEXT, "errorMessage" TEXT, "generationStartedAt" TIMESTAMP(3), "generationEndedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildrenClipHeroShotAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChildrenClipHeroShotAttempt_assetId_key" ON "ChildrenClipHeroShotAttempt"("assetId");
CREATE UNIQUE INDEX "ChildrenClipHeroShotAttempt_shotId_attemptNumber_key" ON "ChildrenClipHeroShotAttempt"("shotId", "attemptNumber");
CREATE INDEX "ChildrenClipHeroShotAttempt_shotId_status_idx" ON "ChildrenClipHeroShotAttempt"("shotId", "status");
CREATE INDEX "ChildrenClipHeroShotAttempt_bullJobId_idx" ON "ChildrenClipHeroShotAttempt"("bullJobId");
ALTER TABLE "ChildrenClipHeroShotAttempt" ADD CONSTRAINT "ChildrenClipHeroShotAttempt_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "ChildrenClipShot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipHeroShotAttempt" ADD CONSTRAINT "ChildrenClipHeroShotAttempt_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChildrenClipFinalRender" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "assetId" TEXT, "versionNumber" INTEGER NOT NULL,
  "status" "ChildrenClipFinalRenderStatus" NOT NULL DEFAULT 'queued', "bullJobId" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0, "stage" TEXT, "renderManifest" JSONB, "errorMessage" TEXT,
  "renderStartedAt" TIMESTAMP(3), "renderCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildrenClipFinalRender_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChildrenClipFinalRender_assetId_key" ON "ChildrenClipFinalRender"("assetId");
CREATE UNIQUE INDEX "ChildrenClipFinalRender_projectId_versionNumber_key" ON "ChildrenClipFinalRender"("projectId", "versionNumber");
CREATE INDEX "ChildrenClipFinalRender_projectId_status_idx" ON "ChildrenClipFinalRender"("projectId", "status");
CREATE INDEX "ChildrenClipFinalRender_bullJobId_idx" ON "ChildrenClipFinalRender"("bullJobId");
ALTER TABLE "ChildrenClipFinalRender" ADD CONSTRAINT "ChildrenClipFinalRender_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipFinalRender" ADD CONSTRAINT "ChildrenClipFinalRender_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
