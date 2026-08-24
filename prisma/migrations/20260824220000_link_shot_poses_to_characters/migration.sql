ALTER TABLE "ChildrenClipShotAsset"
ADD COLUMN "characterVersionId" TEXT;

CREATE INDEX "ChildrenClipShotAsset_characterVersionId_idx"
ON "ChildrenClipShotAsset"("characterVersionId");

ALTER TABLE "ChildrenClipShotAsset"
ADD CONSTRAINT "ChildrenClipShotAsset_characterVersionId_fkey"
FOREIGN KEY ("characterVersionId") REFERENCES "CharacterVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
