# Render Observability And Scene Retry Plan

## Goal

Improve long-running render visibility and recovery without restarting the whole project pipeline.

Primary objectives:

- confirm to the user that rendering is still alive
- show precise elapsed time on the processing screen
- persist structured render metrics for later tuning
- allow retry of the current visual generation attempt for a single scene
- avoid restarting ComfyUI globally unless explicitly needed in operations

This document is intentionally limited to design. It does not require runtime code changes during the current render.

## Current Problems

- `Project.status=rendering` is too coarse for ComfyUI-backed video generation.
- `ProcessingJob.updatedAt` only changes when the worker emits explicit progress events.
- `isPossiblyStalled` currently uses a 45-second threshold, which is too aggressive for ComfyUI.
- The frontend shows rendering, but cannot distinguish:
  - active inferencing
  - waiting for external output
  - long-running but healthy work
  - suspected stuck external generation
- There is no scene-level retry mechanism once a ComfyUI attempt starts.
- ComfyUI parameters and attempt durations are not persisted in a structured form for analysis.

## Proposed Model

### New Scene Attempt Entity

Add a new table to represent each external visual generation attempt.

Suggested Prisma additions:

```prisma
enum SceneRenderAttemptStatus {
  queued
  submitted
  waiting_external
  confirmed_external_active
  completed
  failed
  cancelled
  abandoned
}

model SceneRenderAttempt {
  id                      String                   @id @default(cuid())
  projectId               String
  sceneId                 String
  attemptNumber           Int
  provider                String
  status                  SceneRenderAttemptStatus
  promptId                String?
  sourceType              String
  hasReferenceImage       Boolean                 @default(false)
  width                   Int?
  height                  Int?
  fps                     Int?
  durationSeconds         Float?
  expectedFrameCount      Int?
  steps                   Int?
  cfg                     Float?
  sampler                 String?
  scheduler               String?
  checkpointName          String?
  unetName                String?
  clipName                String?
  clipType                String?
  vaeName                 String?
  modelShift              Float?
  startedAt               DateTime                @default(now())
  submittedAt             DateTime?
  firstExternalSeenAt     DateTime?
  lastHeartbeatAt         DateTime?
  finishedAt              DateTime?
  durationMs              Int?
  errorMessage            String?
  metadata                Json?
  createdAt               DateTime                @default(now())
  updatedAt               DateTime                @updatedAt
  project                 Project                 @relation(fields: [projectId], references: [id], onDelete: Cascade)
  scene                   Scene                   @relation(fields: [sceneId], references: [id], onDelete: Cascade)

  @@unique([sceneId, attemptNumber])
  @@index([projectId, status])
  @@index([sceneId, status])
  @@index([promptId])
}
```

### Optional Lightweight Scene Fields

If useful for query speed, add summary fields on `Scene`:

```prisma
model Scene {
  // existing fields...
  activeAttemptId       String?
  lastAttemptStatus     String?
  lastAttemptStartedAt  DateTime?
  lastAttemptHeartbeatAt DateTime?
  attempts              SceneRenderAttempt[]
}
```

These summary fields are optional. The first implementation can compute from `SceneRenderAttempt`.

## Backend Status Contract

### Extend Project Status Response

Extend `ProjectStatusResponse` with render-specific live data:

```ts
interface ProjectStatusResponse {
  // existing fields...
  renderRuntime: {
    totalElapsedSeconds: number | null;
    currentStageElapsedSeconds: number | null;
    currentSceneElapsedSeconds: number | null;
    lastServerHeartbeatAt: string | null;
    lastExternalHeartbeatAt: string | null;
    health: 'normal' | 'long_running' | 'suspected_stuck';
    activeScene: {
      sceneId: string;
      index: number;
      title: string;
      attemptNumber: number;
      provider: string;
      promptId: string | null;
    } | null;
  } | null;
}
```

### Extend Scene Response

Extend `ProjectScene` with current attempt summary and action availability:

```ts
interface ProjectScene {
  // existing fields...
  attemptSummary: {
    activeAttemptId: string | null;
    latestAttemptStatus: string | null;
    attemptNumber: number | null;
    elapsedSeconds: number | null;
    lastHeartbeatAt: string | null;
    lastExternalHeartbeatAt: string | null;
    canRetryAttempt: boolean;
  } | null;
}
```

## Worker Changes

### 1. Scene Attempt Lifecycle

When `ProjectRenderService` starts a scene:

- create `SceneRenderAttempt`
- set `status=submitted` once `/prompt` succeeds
- store `promptId`
- store the full parameter snapshot used for ComfyUI

When ComfyUI polling begins:

- set `status=waiting_external`
- set `submittedAt`

When the first positive sign of external activity appears:

- set `firstExternalSeenAt`
- set `status=confirmed_external_active`

Positive signs can include:

- prompt exists in history
- queue endpoint confirms the prompt is still running
- websocket event support if added later

### 2. Five-Minute Heartbeat

Inside `waitForHistory()` in `apps/worker/src/services/comfyui-client.service.ts`:

- add a periodic callback every 5 minutes
- callback should not change pipeline stage
- callback should update:
  - `ProcessingJob.updatedAt`
  - `ProcessingJob.detailMessage`
  - `ProcessingJob.activityLog`
  - `SceneRenderAttempt.lastHeartbeatAt`

Suggested heartbeat message:

- `Cena 1 de 3 ainda aguardando saida do ComfyUI ha 10m. O servidor continua monitorando o prompt.`

### 3. External Confirmation Tracking

Not every 3-second poll should hit the database.

Recommended cadence:

- in-memory polling every 3 seconds remains unchanged
- DB heartbeat every 5 minutes
- DB external confirmation update only when one of these changes:
  - first seen in queue/history
  - status transition
  - every 5-minute heartbeat

### 4. Completion And Failure

On completion:

- mark `SceneRenderAttempt.status=completed`
- set `finishedAt`
- compute `durationMs`

On failure:

- mark `SceneRenderAttempt.status=failed`
- set `finishedAt`
- compute `durationMs`
- persist `errorMessage`

On user-triggered retry while an attempt is still running:

- mark previous attempt as `abandoned` or `cancelled`
- create a new attempt with `attemptNumber + 1`

## Retry Button Design

### Scope

Do not restart the whole ComfyUI service from the product UI.

Instead expose scene-scoped actions:

- `Reiniciar render desta cena`
- optionally `Reiniciar cena atual` in the processing page when a scene is active

### Button Placement

Primary location:

- scene card in `SceneList`

Secondary location:

- processing page section for the active scene during `rendering`

### Availability Rules

Show the button only when:

- project status is `rendering`
- scene is the active scene or latest failed/stuck scene
- latest attempt status is one of:
  - `waiting_external`
  - `confirmed_external_active`
  - `failed`
- elapsed time exceeds a minimum threshold, suggested:
  - `10 minutes` for active retries
  - immediate for failed attempts

### API Contract

New endpoint:

`POST /projects/:id/scenes/:sceneId/retry-render`

Suggested body:

```json
{
  "forceCancelCurrentAttempt": true
}
```

Suggested behavior:

- verify ownership and project state
- if the target scene is not eligible, return `409`
- if an active ComfyUI `promptId` exists, attempt best-effort cancellation if supported
- mark the current attempt `cancelled` or `abandoned`
- clear current scene output fields if needed
- enqueue a scene-level retry job or re-enter render from the current scene

### Queue Strategy

Preferred implementation:

- keep the main project job owner model
- add a scene-retry command persisted in DB
- active render loop checks before each scene poll cycle whether the current attempt was invalidated

Alternative:

- enqueue a dedicated `scene.render.retry` job

Preferred for simplicity:

- stay within the existing project render worker and add cooperative cancellation/retry checks

## UX Design

### Processing Page

Add a runtime panel above the timeline:

- `Tempo total da geracao`
- `Tempo desta etapa`
- `Tempo da cena atual`
- `Ultima confirmacao do servidor`
- `Ultima confirmacao do ComfyUI`

Suggested health states:

- `normal`
  - `Render em andamento.`
- `long_running`
  - `Esta etapa esta demorando, mas o servidor segue recebendo sinais de atividade.`
- `suspected_stuck`
  - `Nao houve confirmacao recente do render externo. Voce pode aguardar ou reiniciar a cena atual.`

### Scene List

Each scene card should show:

- scene status
- active attempt number
- current attempt duration
- provider
- reference image indicator
- action button when retry is allowed

### Activity Log

Include explicit heartbeat events:

- `Confirmacao periodica do servidor`
- `ComfyUI continua processando a cena`
- `Tentativa reiniciada pelo usuario`

Avoid flooding:

- only log the 5-minute heartbeat
- do not log every 3-second poll

## Metrics Strategy

### Why Structured Metrics Matter

This data should support future parameter tuning:

- which widths produce too many long-running attempts
- whether reference images increase latency
- whether some samplers or step counts are not worth the cost
- typical duration per second of output
- timeout frequency by provider/model combination

### Metrics To Persist

Per `SceneRenderAttempt`:

- scene duration target
- generated frame count
- actual attempt duration
- provider
- checkpoint/model fields
- image reference present or not
- outcome

Derived dashboards later:

- median duration by width/height
- p95 by model
- failure rate by sampler
- duration per frame
- duration per clip second

## Proposed Thresholds

Initial thresholds:

- UI quiet-warning threshold: `2 minutes`
- long-running threshold: `10 minutes`
- heartbeat interval: `5 minutes`
- suspected-stuck threshold:
  - no server heartbeat for `7 minutes`, or
  - no external confirmation for `15 minutes`

These are product thresholds, not hard failure thresholds.

Timeouts remain separate and should still come from configuration.

## Rollout Plan

### Phase 1

- add `SceneRenderAttempt` table
- persist attempt lifecycle
- add 5-minute worker heartbeat
- expose render runtime fields in project status
- show elapsed timers in processing UI

### Phase 2

- add scene-level retry endpoint
- add retry button in scene cards
- add cooperative cancellation/abandon logic

### Phase 3

- improve stuck detection using external confirmations
- refine thresholds from real data
- add dashboard/reporting over attempt metrics

## File-Level Implementation Map

### Backend

- `prisma/schema.prisma`
  - add `SceneRenderAttempt`
  - optionally add summary fields to `Scene`
- `apps/worker/src/services/comfyui-client.service.ts`
  - add progress callback
  - add 5-minute heartbeat logic
  - track external confirmations
- `apps/worker/src/services/project-render.service.ts`
  - create attempts
  - update attempt state transitions
  - support scene retry decision points
- `apps/worker/src/services/processing-progress.service.ts`
  - optionally add heartbeat metadata helpers
- `apps/api/src/modules/projects/services/project.presenter.ts`
  - extend status and scene responses
- `apps/api/src/modules/projects/services/projects.service.ts`
  - add scene retry command
- `apps/api/src/modules/projects/controllers/projects.controller.ts`
  - expose `POST /projects/:id/scenes/:sceneId/retry-render`

### Frontend

- `apps/frontend/src/types/project.types.ts`
  - extend status and scene contracts
- `apps/frontend/src/components/ProjectStatusTimeline.vue`
  - add runtime panel and health states
- `apps/frontend/src/components/SceneList.vue`
  - add attempt info and retry button
- `apps/frontend/src/pages/ProcessingPage.vue`
  - show current active scene retry action
- `apps/frontend/src/services/projects.service.ts`
  - add scene retry request
- `apps/frontend/src/stores/projects.store.ts`
  - add scene retry action and refresh logic

## Recommendation

Implement the observability and metrics layer first, then add the retry button.

Reason:

- retry without attempt telemetry will be hard to debug
- telemetry without retry already improves user trust
- the same attempt model supports both features cleanly
