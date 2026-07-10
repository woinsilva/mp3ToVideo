CREATE TYPE "SceneRenderAttemptStatus" AS ENUM (
  'queued',
  'submitted',
  'waiting_external',
  'confirmed_external_active',
  'completed',
  'failed',
  'cancelled',
  'abandoned'
);

CREATE TABLE "SceneRenderAttempt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sceneId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "SceneRenderAttemptStatus" NOT NULL DEFAULT 'queued',
  "promptId" TEXT,
  "sourceType" TEXT NOT NULL,
  "hasReferenceImage" BOOLEAN NOT NULL DEFAULT false,
  "width" INTEGER,
  "height" INTEGER,
  "fps" INTEGER,
  "durationSeconds" DOUBLE PRECISION,
  "expectedFrameCount" INTEGER,
  "steps" INTEGER,
  "cfg" DOUBLE PRECISION,
  "sampler" TEXT,
  "scheduler" TEXT,
  "checkpointName" TEXT,
  "unetName" TEXT,
  "clipName" TEXT,
  "clipType" TEXT,
  "vaeName" TEXT,
  "modelShift" DOUBLE PRECISION,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "firstExternalSeenAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SceneRenderAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SceneRenderAttempt_sceneId_attemptNumber_key"
ON "SceneRenderAttempt"("sceneId", "attemptNumber");

CREATE INDEX "SceneRenderAttempt_projectId_status_idx"
ON "SceneRenderAttempt"("projectId", "status");

CREATE INDEX "SceneRenderAttempt_sceneId_status_idx"
ON "SceneRenderAttempt"("sceneId", "status");

CREATE INDEX "SceneRenderAttempt_promptId_idx"
ON "SceneRenderAttempt"("promptId");

ALTER TABLE "SceneRenderAttempt"
ADD CONSTRAINT "SceneRenderAttempt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "SceneRenderAttempt"
ADD CONSTRAINT "SceneRenderAttempt_sceneId_fkey"
FOREIGN KEY ("sceneId") REFERENCES "Scene"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
