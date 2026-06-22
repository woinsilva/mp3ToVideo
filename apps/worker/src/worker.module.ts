import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { ProjectProcessor } from './processors/project.processor';
import { AudioMetadataService } from './services/audio-metadata.service';
import { FfmpegCommandBuilderService } from './services/ffmpeg-command-builder.service';
import { FfmpegRenderingService } from './services/ffmpeg-rendering.service';
import { LyricsFallbackService } from './services/lyrics-fallback.service';
import { MusicStructureService } from './services/music-structure.service';
import { OllamaClientService } from './services/ollama-client.service';
import { ProcessingProgressService } from './services/processing-progress.service';
import { ProjectPipelineStateService } from './services/project-pipeline-state.service';
import { ProjectProcessingPipelineService } from './services/project-processing-pipeline.service';
import { ProjectRenderService } from './services/project-render.service';
import { RenderStorageService } from './services/render-storage.service';
import { ScenePlanningService } from './services/scene-planning.service';
import { ScenePromptGenerationService } from './services/scene-prompt-generation.service';
import { ScenePromptService } from './services/scene-prompt.service';
import { StoryboardGenerationService } from './services/storyboard-generation.service';
import { StoryboardFallbackService } from './services/storyboard-fallback.service';
import { ProjectProcessingWorkerService } from './workers/project-processing-worker.service';
import { RedisConnectionService } from './workers/redis-connection.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [configuration],
      validationSchema: envValidationSchema
    }),
    PrismaModule
  ],
  providers: [
    RedisConnectionService,
    ProjectProcessor,
    AudioMetadataService,
    FfmpegCommandBuilderService,
    FfmpegRenderingService,
    LyricsFallbackService,
    MusicStructureService,
    OllamaClientService,
    ProcessingProgressService,
    ProjectPipelineStateService,
    ProjectProcessingPipelineService,
    ProjectRenderService,
    RenderStorageService,
    ScenePlanningService,
    ScenePromptGenerationService,
    ScenePromptService,
    StoryboardGenerationService,
    StoryboardFallbackService,
    ProjectProcessingWorkerService
  ]
})
export class WorkerModule {}
