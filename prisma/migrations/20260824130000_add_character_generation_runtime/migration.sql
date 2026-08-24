ALTER TYPE "CharacterVersionStatus" ADD VALUE 'queued';

ALTER TABLE "CharacterVersion"
ADD COLUMN "seed" INTEGER,
ADD COLUMN "bullJobId" TEXT,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "generationStartedAt" TIMESTAMP(3),
ADD COLUMN "generationCompletedAt" TIMESTAMP(3);

CREATE INDEX "CharacterVersion_bullJobId_idx" ON "CharacterVersion"("bullJobId");
