ALTER TYPE "ProjectGenerationMode" ADD VALUE 'children_clip';

CREATE TYPE "ChildrenClipAspectRatio" AS ENUM ('landscape_16_9', 'portrait_9_16', 'square_1_1');
CREATE TYPE "ChildrenClipProductionStatus" AS ENUM ('setup', 'analyzing_audio', 'planning_narrative', 'designing_characters', 'storyboarding', 'generating_assets', 'animating', 'generating_hero_shots', 'compositing', 'encoding', 'validating', 'completed', 'failed');
CREATE TYPE "CharacterScope" AS ENUM ('project', 'organization');
CREATE TYPE "CharacterVersionOrigin" AS ENUM ('generated', 'uploaded', 'hybrid');
CREATE TYPE "CharacterVersionStatus" AS ENUM ('draft', 'generating', 'ready_for_review', 'approved', 'rejected', 'failed');
CREATE TYPE "CharacterAssetRole" AS ENUM ('primary_reference', 'front_view', 'side_view', 'back_view', 'portrait', 'expression', 'pose', 'mouth_shape', 'eye_state', 'source_reference');

CREATE TABLE "ChildrenClip" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "concept" TEXT NOT NULL,
  "audienceAgeMin" INTEGER NOT NULL,
  "audienceAgeMax" INTEGER NOT NULL,
  "aspectRatio" "ChildrenClipAspectRatio" NOT NULL DEFAULT 'landscape_16_9',
  "visualStyle" TEXT NOT NULL,
  "productionStatus" "ChildrenClipProductionStatus" NOT NULL DEFAULT 'setup',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildrenClip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Character" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "originProjectId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "scope" "CharacterScope" NOT NULL DEFAULT 'project',
  "approvedVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterVersion" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "origin" "CharacterVersionOrigin" NOT NULL,
  "status" "CharacterVersionStatus" NOT NULL DEFAULT 'draft',
  "description" TEXT NOT NULL,
  "generationPrompt" TEXT,
  "invariants" JSONB,
  "generationMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharacterVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterAsset" (
  "id" TEXT NOT NULL,
  "characterVersionId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "role" "CharacterAssetRole" NOT NULL,
  "label" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CharacterAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectCharacter" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "selectedVersionId" TEXT,
  "roleName" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectCharacter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildrenClip_projectId_key" ON "ChildrenClip"("projectId");
CREATE UNIQUE INDEX "Character_approvedVersionId_key" ON "Character"("approvedVersionId");
CREATE INDEX "Character_organizationId_scope_deletedAt_idx" ON "Character"("organizationId", "scope", "deletedAt");
CREATE INDEX "Character_originProjectId_idx" ON "Character"("originProjectId");
CREATE UNIQUE INDEX "CharacterVersion_characterId_versionNumber_key" ON "CharacterVersion"("characterId", "versionNumber");
CREATE INDEX "CharacterVersion_characterId_status_idx" ON "CharacterVersion"("characterId", "status");
CREATE UNIQUE INDEX "CharacterAsset_characterVersionId_assetId_key" ON "CharacterAsset"("characterVersionId", "assetId");
CREATE INDEX "CharacterAsset_characterVersionId_role_idx" ON "CharacterAsset"("characterVersionId", "role");
CREATE UNIQUE INDEX "ProjectCharacter_projectId_characterId_key" ON "ProjectCharacter"("projectId", "characterId");
CREATE INDEX "ProjectCharacter_projectId_sortOrder_idx" ON "ProjectCharacter"("projectId", "sortOrder");

ALTER TABLE "ChildrenClip" ADD CONSTRAINT "ChildrenClip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Character" ADD CONSTRAINT "Character_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Character" ADD CONSTRAINT "Character_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Character" ADD CONSTRAINT "Character_originProjectId_fkey" FOREIGN KEY ("originProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Character" ADD CONSTRAINT "Character_approvedVersionId_fkey" FOREIGN KEY ("approvedVersionId") REFERENCES "CharacterVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "CharacterVersion" ADD CONSTRAINT "CharacterVersion_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterAsset" ADD CONSTRAINT "CharacterAsset_characterVersionId_fkey" FOREIGN KEY ("characterVersionId") REFERENCES "CharacterVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterAsset" ADD CONSTRAINT "CharacterAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCharacter" ADD CONSTRAINT "ProjectCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCharacter" ADD CONSTRAINT "ProjectCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCharacter" ADD CONSTRAINT "ProjectCharacter_selectedVersionId_fkey" FOREIGN KEY ("selectedVersionId") REFERENCES "CharacterVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
