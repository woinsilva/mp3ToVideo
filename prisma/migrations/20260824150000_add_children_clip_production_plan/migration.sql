CREATE TYPE "ChildrenClipPlanStatus" AS ENUM ('draft', 'queued', 'generating', 'ready_for_review', 'approved', 'failed');
CREATE TYPE "ChildrenClipShotStatus" AS ENUM ('draft', 'approved', 'needs_revision');
CREATE TYPE "ChildrenClipRenderMode" AS ENUM ('animation_2d', 'wan', 'hybrid');

CREATE TABLE "ChildrenClipPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "ChildrenClipPlanStatus" NOT NULL DEFAULT 'draft',
    "bullJobId" TEXT,
    "visualBible" JSONB,
    "narrative" JSONB,
    "generationMetadata" JSONB,
    "revisionInstruction" TEXT,
    "errorMessage" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "generationEndedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildrenClipPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChildrenClipShot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "musicSectionId" TEXT,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startSeconds" DOUBLE PRECISION NOT NULL,
    "endSeconds" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "status" "ChildrenClipShotStatus" NOT NULL DEFAULT 'draft',
    "renderMode" "ChildrenClipRenderMode" NOT NULL DEFAULT 'animation_2d',
    "framing" TEXT NOT NULL,
    "cameraMovement" TEXT NOT NULL,
    "characterAction" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "backgroundPrompt" TEXT NOT NULL,
    "transitionIn" TEXT,
    "transitionOut" TEXT,
    "lyricText" TEXT,
    "characterVersionIds" JSONB,
    "layers" JSONB,
    "motionPreset" TEXT,
    "revisionInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildrenClipShot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildrenClipPlan_projectId_key" ON "ChildrenClipPlan"("projectId");
CREATE INDEX "ChildrenClipPlan_bullJobId_idx" ON "ChildrenClipPlan"("bullJobId");
CREATE INDEX "ChildrenClipPlan_status_updatedAt_idx" ON "ChildrenClipPlan"("status", "updatedAt");
CREATE UNIQUE INDEX "ChildrenClipShot_projectId_index_key" ON "ChildrenClipShot"("projectId", "index");
CREATE INDEX "ChildrenClipShot_projectId_startSeconds_idx" ON "ChildrenClipShot"("projectId", "startSeconds");
CREATE INDEX "ChildrenClipShot_musicSectionId_idx" ON "ChildrenClipShot"("musicSectionId");
ALTER TABLE "ChildrenClipPlan" ADD CONSTRAINT "ChildrenClipPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipShot" ADD CONSTRAINT "ChildrenClipShot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipShot" ADD CONSTRAINT "ChildrenClipShot_musicSectionId_fkey" FOREIGN KEY ("musicSectionId") REFERENCES "MusicSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
