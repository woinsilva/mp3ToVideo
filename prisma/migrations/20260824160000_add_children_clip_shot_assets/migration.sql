CREATE TYPE "ChildrenClipShotAssetRole" AS ENUM ('background', 'foreground', 'prop', 'character_pose', 'storyboard_frame');
CREATE TYPE "ChildrenClipShotAssetOrigin" AS ENUM ('generated', 'uploaded');
CREATE TYPE "ChildrenClipShotAssetStatus" AS ENUM ('draft', 'queued', 'generating', 'ready_for_review', 'approved', 'failed');

CREATE TABLE "ChildrenClipShotAsset" (
    "id" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "assetId" TEXT,
    "role" "ChildrenClipShotAssetRole" NOT NULL,
    "origin" "ChildrenClipShotAssetOrigin" NOT NULL,
    "status" "ChildrenClipShotAssetStatus" NOT NULL DEFAULT 'draft',
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "generationPrompt" TEXT,
    "negativePrompt" TEXT,
    "seed" INTEGER,
    "bullJobId" TEXT,
    "generationMetadata" JSONB,
    "errorMessage" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "generationEndedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildrenClipShotAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildrenClipShotAsset_assetId_key" ON "ChildrenClipShotAsset"("assetId");
CREATE UNIQUE INDEX "ChildrenClipShotAsset_shotId_role_versionNumber_key" ON "ChildrenClipShotAsset"("shotId", "role", "versionNumber");
CREATE INDEX "ChildrenClipShotAsset_shotId_role_status_idx" ON "ChildrenClipShotAsset"("shotId", "role", "status");
CREATE INDEX "ChildrenClipShotAsset_bullJobId_idx" ON "ChildrenClipShotAsset"("bullJobId");
ALTER TABLE "ChildrenClipShotAsset" ADD CONSTRAINT "ChildrenClipShotAsset_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "ChildrenClipShot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipShotAsset" ADD CONSTRAINT "ChildrenClipShotAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
