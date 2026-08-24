CREATE TYPE "CharacterAssetOrigin" AS ENUM ('generated', 'uploaded');
CREATE TYPE "CharacterAssetStatus" AS ENUM ('draft', 'queued', 'generating', 'ready_for_review', 'approved', 'rejected', 'failed');

ALTER TABLE "CharacterAsset"
ALTER COLUMN "assetId" DROP NOT NULL,
ADD COLUMN "origin" "CharacterAssetOrigin" NOT NULL DEFAULT 'uploaded',
ADD COLUMN "status" "CharacterAssetStatus" NOT NULL DEFAULT 'approved',
ADD COLUMN "generationPrompt" TEXT,
ADD COLUMN "negativePrompt" TEXT,
ADD COLUMN "seed" INTEGER,
ADD COLUMN "bullJobId" TEXT,
ADD COLUMN "generationMetadata" JSONB,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "generationStartedAt" TIMESTAMP(3),
ADD COLUMN "generationEndedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE INDEX "CharacterAsset_bullJobId_idx" ON "CharacterAsset"("bullJobId");
