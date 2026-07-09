ALTER TABLE "Scene"
ADD COLUMN "referenceImageAssetId" TEXT;

ALTER TABLE "Scene"
ADD CONSTRAINT "Scene_referenceImageAssetId_fkey"
FOREIGN KEY ("referenceImageAssetId") REFERENCES "Asset"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
