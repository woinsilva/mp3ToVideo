-- Separate reusable locations and shot-level semantics from global narrative data.
CREATE TABLE "ChildrenClipLocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timeOfDay" TEXT,
    "visualPrompt" TEXT NOT NULL,
    "continuityRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildrenClipLocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChildrenClipShot"
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "primaryFocus" TEXT,
  ADD COLUMN "timeOfDay" TEXT,
  ADD COLUMN "emotion" TEXT,
  ADD COLUMN "motionIntent" TEXT,
  ADD COLUMN "continuityFromPreviousShot" TEXT,
  ADD COLUMN "forbiddenEntityVersionIds" JSONB,
  ADD COLUMN "objects" JSONB;

ALTER TABLE "ChildrenClipShotAsset" ADD COLUMN "reviewReason" TEXT;

CREATE UNIQUE INDEX "ChildrenClipLocation_projectId_key_key" ON "ChildrenClipLocation"("projectId", "key");
CREATE INDEX "ChildrenClipLocation_projectId_idx" ON "ChildrenClipLocation"("projectId");
CREATE INDEX "ChildrenClipShot_locationId_idx" ON "ChildrenClipShot"("locationId");

ALTER TABLE "ChildrenClipLocation" ADD CONSTRAINT "ChildrenClipLocation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipShot" ADD CONSTRAINT "ChildrenClipShot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "ChildrenClipLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
