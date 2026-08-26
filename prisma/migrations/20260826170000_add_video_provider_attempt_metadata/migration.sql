ALTER TABLE "ChildrenClipShot" ADD COLUMN "videoGenerationConfig" JSONB;

ALTER TABLE "ChildrenClipHeroShotAttempt"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'comfyui-video',
ADD COLUMN "externalJobId" TEXT,
ADD COLUMN "requestMetadata" JSONB,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "firstExternalSeenAt" TIMESTAMP(3),
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "durationMs" INTEGER;

CREATE INDEX "ChildrenClipHeroShotAttempt_provider_status_idx" ON "ChildrenClipHeroShotAttempt"("provider", "status");
CREATE INDEX "ChildrenClipHeroShotAttempt_externalJobId_idx" ON "ChildrenClipHeroShotAttempt"("externalJobId");
