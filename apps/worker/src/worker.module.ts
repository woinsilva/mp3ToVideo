import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { ProjectProcessor } from './processors/project.processor';
import { AudioMetadataService } from './services/audio-metadata.service';
import { ComfyUiClientService } from './services/comfyui-client.service';
import { FfmpegCommandBuilderService } from './services/ffmpeg-command-builder.service';
import { FfmpegRenderingService } from './services/ffmpeg-rendering.service';
import { LyricsGenerationService } from './services/lyrics-generation.service';
import { LyricsFallbackService } from './services/lyrics-fallback.service';
import { MusicStructureService } from './services/music-structure.service';
import { OllamaClientService } from './services/ollama-client.service';
import { ProcessingProgressService } from './services/processing-progress.service';
import { ProjectPipelineStateService } from './services/project-pipeline-state.service';
import { ProjectProcessingPipelineService } from './services/project-processing-pipeline.service';
import { ProjectRenderService } from './services/project-render.service';
import { RenderStorageService } from './services/render-storage.service';
import { SceneImageGenerationService } from './services/scene-image-generation.service';
import { ScenePlanningService } from './services/scene-planning.service';
import { ScenePromptGenerationService } from './services/scene-prompt-generation.service';
import { ScenePromptService } from './services/scene-prompt.service';
import { SceneVideoGenerationService } from './services/scene-video-generation.service';
import { StoryboardGenerationService } from './services/storyboard-generation.service';
import { StoryboardFallbackService } from './services/storyboard-fallback.service';
import { WhisperTranscriptionService } from './services/whisper-transcription.service';
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
    ComfyUiClientService,
    FfmpegCommandBuilderService,
    FfmpegRenderingService,
    LyricsGenerationService,
    LyricsFallbackService,
    MusicStructureService,
    OllamaClientService,
    ProcessingProgressService,
    ProjectPipelineStateService,
    ProjectProcessingPipelineService,
    ProjectRenderService,
    RenderStorageService,
    SceneImageGenerationService,
    SceneVideoGenerationService,
    ScenePlanningService,
    ScenePromptGenerationService,
    ScenePromptService,
    StoryboardGenerationService,
    StoryboardFallbackService,
    WhisperTranscriptionService,
    ProjectProcessingWorkerService
  ]
})
export class WorkerModule {}
