CREATE TYPE "ChildrenClipStyleLockStatus" AS ENUM ('locked', 'stale');

CREATE TABLE "ChildrenClipStyleProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "ChildrenClipStyleLockStatus" NOT NULL DEFAULT 'locked',
    "profile" JSONB NOT NULL,
    "negativeConstraints" JSONB NOT NULL,
    "styleReferenceAssetIds" JSONB NOT NULL,
    "sourceCharacterVersionIds" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleAt" TIMESTAMP(3),
    "staleReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildrenClipStyleProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChildrenClipLocation" ADD COLUMN "masterBackgroundAssetId" TEXT;
ALTER TABLE "ChildrenClipShot" ADD COLUMN "characterPlacement" JSONB;
ALTER TABLE "ChildrenClipShot" ADD COLUMN "backgroundSafeZones" JSONB;
ALTER TABLE "ChildrenClipShot" ADD COLUMN "groundingRules" JSONB;

CREATE UNIQUE INDEX "ChildrenClipStyleProfile_projectId_key" ON "ChildrenClipStyleProfile"("projectId");
CREATE INDEX "ChildrenClipStyleProfile_status_updatedAt_idx" ON "ChildrenClipStyleProfile"("status", "updatedAt");
CREATE INDEX "ChildrenClipLocation_masterBackgroundAssetId_idx" ON "ChildrenClipLocation"("masterBackgroundAssetId");

ALTER TABLE "ChildrenClipStyleProfile" ADD CONSTRAINT "ChildrenClipStyleProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipLocation" ADD CONSTRAINT "ChildrenClipLocation_masterBackgroundAssetId_fkey" FOREIGN KEY ("masterBackgroundAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
