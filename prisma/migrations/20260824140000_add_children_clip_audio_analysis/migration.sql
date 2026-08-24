CREATE TYPE "ChildrenClipAudioAnalysisStatus" AS ENUM ('queued', 'analyzing', 'completed', 'failed');

CREATE TABLE "ChildrenClipAudioAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ChildrenClipAudioAnalysisStatus" NOT NULL DEFAULT 'queued',
    "bullJobId" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "sampleRate" INTEGER,
    "channels" INTEGER,
    "bitrate" INTEGER,
    "bpm" DOUBLE PRECISION,
    "beatConfidence" DOUBLE PRECISION,
    "timeSignature" INTEGER NOT NULL DEFAULT 4,
    "loudnessDb" DOUBLE PRECISION,
    "peakDb" DOUBLE PRECISION,
    "beatGrid" JSONB,
    "energyCurve" JSONB,
    "waveform" JSONB,
    "errorMessage" TEXT,
    "analysisStartedAt" TIMESTAMP(3),
    "analysisCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildrenClipAudioAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChildrenClipLyricCue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lineIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "startSeconds" DOUBLE PRECISION NOT NULL,
    "endSeconds" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "words" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildrenClipLyricCue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildrenClipAudioAnalysis_projectId_key" ON "ChildrenClipAudioAnalysis"("projectId");
CREATE INDEX "ChildrenClipAudioAnalysis_bullJobId_idx" ON "ChildrenClipAudioAnalysis"("bullJobId");
CREATE INDEX "ChildrenClipAudioAnalysis_status_updatedAt_idx" ON "ChildrenClipAudioAnalysis"("status", "updatedAt");
CREATE UNIQUE INDEX "ChildrenClipLyricCue_projectId_lineIndex_key" ON "ChildrenClipLyricCue"("projectId", "lineIndex");
CREATE INDEX "ChildrenClipLyricCue_projectId_startSeconds_idx" ON "ChildrenClipLyricCue"("projectId", "startSeconds");
ALTER TABLE "ChildrenClipAudioAnalysis" ADD CONSTRAINT "ChildrenClipAudioAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildrenClipLyricCue" ADD CONSTRAINT "ChildrenClipLyricCue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
