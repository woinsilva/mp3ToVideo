ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'storyboard_image';

ALTER TABLE "Storyboard"
  ADD COLUMN IF NOT EXISTS "visualAssetId" TEXT,
  ADD COLUMN IF NOT EXISTS "visualPrompt" TEXT,
  ADD COLUMN IF NOT EXISTS "revisionInstruction" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Storyboard_visualAssetId_fkey'
  ) THEN
    ALTER TABLE "Storyboard"
      ADD CONSTRAINT "Storyboard_visualAssetId_fkey"
      FOREIGN KEY ("visualAssetId") REFERENCES "Asset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
