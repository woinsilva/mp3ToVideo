ALTER TABLE "Project"
ADD COLUMN "stabilityTest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "wanOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "generationSeed" INTEGER,
ADD COLUMN "generationCfg" DOUBLE PRECISION,
ADD COLUMN "generationSteps" INTEGER;

ALTER TABLE "SceneRenderAttempt"
ADD COLUMN "workflowName" TEXT,
ADD COLUMN "positivePrompt" TEXT,
ADD COLUMN "negativePrompt" TEXT,
ADD COLUMN "seed" INTEGER,
ADD COLUMN "requestedDurationSeconds" DOUBLE PRECISION,
ADD COLUMN "effectiveDurationSeconds" DOUBLE PRECISION;
