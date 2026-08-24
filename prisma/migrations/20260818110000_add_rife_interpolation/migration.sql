CREATE TYPE "FrameInterpolationMode" AS ENUM ('off', 'rife_2x');

ALTER TYPE "AssetType" ADD VALUE 'interpolated_render';

ALTER TABLE "Project"
ADD COLUMN "frameInterpolationMode" "FrameInterpolationMode" NOT NULL DEFAULT 'off';

ALTER TABLE "Asset"
ADD COLUMN "metadata" JSONB;
