ALTER TYPE "ProjectGenerationMode" ADD VALUE 'image';
ALTER TYPE "AssetType" ADD VALUE 'source_image';

ALTER TABLE "Asset"
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

ALTER TABLE "Project"
ADD COLUMN "sourceImageAssetId" TEXT;

CREATE UNIQUE INDEX "Project_sourceImageAssetId_key"
ON "Project"("sourceImageAssetId");

ALTER TABLE "Project"
ADD CONSTRAINT "Project_sourceImageAssetId_fkey"
FOREIGN KEY ("sourceImageAssetId") REFERENCES "Asset"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;
