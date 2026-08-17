CREATE TYPE "ProjectGenerationMode" AS ENUM ('music', 'prompt');

ALTER TABLE "Project"
ADD COLUMN "generationMode" "ProjectGenerationMode" NOT NULL DEFAULT 'music',
ADD COLUMN "generationPrompt" TEXT;
