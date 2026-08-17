import { copyFile, stat, writeFile } from 'node:fs/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssetType,
  RenderStatus,
  SceneRenderAttemptStatus,
  SceneStatus
} from '@prisma/client';
import type { ScenePrompt } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import {
  ComfyUiGenerationCancelledError,
  type ComfyUiHeartbeat
} from './comfyui-client.service';
import { FfmpegRenderingService } from './ffmpeg-rendering.service';
import { ProcessingProgressService } from './processing-progress.service';
import { RenderStorageService } from './render-storage.service';
import { SceneImageGenerationService } from './scene-image-generation.service';
import {
  SceneVideoGenerationService,
  type SceneVideoResult
} from './scene-video-generation.service';

interface RenderSceneInput {
  id: string;
  title: string;
  durationSeconds: number;
  sectionType: string;
  status: SceneStatus;
  visualProvider: string | null;
  videoAssetStoragePath: string | null;
  referenceImageStoragePath: string | null;
}

interface RenderProjectInput {
  organizationId: string;
  projectId: string;
  audioPath: string | null;
  durationSeconds: number;
  visualCheckpointName: string | null;
  scenes: RenderSceneInput[];
}

interface SceneVideoAttemptOutcome {
  result: SceneVideoResult | null;
  errorMessage: string | null;
  restarted: boolean;
}

interface SceneReferenceInput {
  path: string | null;
  sourceType: string;
  hasManualReferenceImage: boolean;
  hasContinuityFrame: boolean;
}

@Injectable()
export class ProjectRenderService {
  private readonly logger = new Logger(ProjectRenderService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(RenderStorageService)
    private readonly renderStorageService: RenderStorageService,
    @Inject(SceneVideoGenerationService)
    private readonly sceneVideoGenerationService: SceneVideoGenerationService,
    @Inject(SceneImageGenerationService)
    private readonly sceneImageGenerationService: SceneImageGenerationService,
    @Inject(FfmpegRenderingService)
    private readonly ffmpegRenderingService: FfmpegRenderingService,
    @Inject(ProcessingProgressService)
    private readonly processingProgressService: ProcessingProgressService
  ) {}

  async render(input: RenderProjectInput): Promise<void> {
    const existingRender = await this.prismaService.render.findFirst({
      where: {
        projectId: input.projectId
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    const renderRecord = existingRender
      ? await this.prismaService.render.update({
          where: {
            id: existingRender.id
          },
          data: {
            status: RenderStatus.rendering,
            durationSeconds: input.durationSeconds,
            assetId: null
          }
        })
      : await this.prismaService.render.create({
          data: {
            projectId: input.projectId,
            status: RenderStatus.rendering,
            durationSeconds: input.durationSeconds
          }
        });

    try {
      const sceneClipPaths: string[] = [];
      let previousContinuityFramePath: string | null = null;

      for (const [index, scene] of input.scenes.entries()) {
        const reusableSceneClipPath =
          scene.status === SceneStatus.completed && scene.videoAssetStoragePath
            ? scene.videoAssetStoragePath
            : null;

        if (
          reusableSceneClipPath &&
          (await this.pathExists(this.renderStorageService.getAbsolutePath(reusableSceneClipPath)))
        ) {
          sceneClipPaths.push(reusableSceneClipPath);
          previousContinuityFramePath = await this.extractContinuityFrame(
            input,
            index,
            this.renderStorageService.getAbsolutePath(reusableSceneClipPath)
          );
          await this.processingProgressService.heartbeat(
            input.projectId,
            this.sceneRenderProgress(index + 1, input.scenes.length),
            `Cena ${index + 1} reaproveitada do processamento anterior.`,
            {
              stage: 'rendering',
              message:
                `Cena ${index + 1} reaproveitada do processamento anterior ` +
                `(provider: ${scene.visualProvider ?? 'desconhecido'}).`,
              provider: scene.visualProvider ?? 'reused'
            }
          );
          continue;
        }

        await this.processingProgressService.heartbeat(
          input.projectId,
          this.sceneRenderProgress(index, input.scenes.length),
          `Renderizando cena ${index + 1} de ${input.scenes.length}: ${scene.title}.`,
          {
            stage: 'rendering',
            message: `Renderizando cena ${index + 1} de ${input.scenes.length}: ${scene.title}.`
          }
        );
        const sceneClipPath = this.renderStorageService.buildSceneClipPath(
          input.organizationId,
          input.projectId,
          index
        );
        const sceneClipAbsolutePath =
          await this.renderStorageService.ensureParentDirectory(sceneClipPath);
        const scenePrompt = await this.prismaService.scenePrompt.findUnique({
          where: {
            sceneId: scene.id
          }
        });

        let visualProvider = 'procedural';
        let videoGenerationError: string | null = null;
        let imageGenerationError: string | null = null;
        const sceneReference = this.resolveSceneReference(scene, previousContinuityFramePath);

        if (sceneReference.hasContinuityFrame) {
          await this.processingProgressService.heartbeat(
            input.projectId,
            this.sceneRenderProgress(index, input.scenes.length),
            `Cena ${index + 1} usara o ultimo frame da cena anterior como referencia de continuidade.`,
            {
              stage: 'rendering',
              message:
                `Cena ${index + 1} usara continuidade visual da cena anterior` +
                (sceneReference.hasManualReferenceImage
                  ? ' e mantera a referencia manual registrada para revisao.'
                  : '.'),
              provider: 'continuity-frame'
            }
          );
        }

        if (!scenePrompt && !this.shouldAllowProceduralFallback()) {
          const message = `Cena ${index + 1} falhou: prompt da cena nao encontrado para gerar o video no ComfyUI.`;
          await this.failScene(input.projectId, scene.id, message, index, input.scenes.length);
          throw new Error(message);
        }

        let generatedSceneVideo: SceneVideoResult | null = null;
        if (scenePrompt) {
          const videoAttemptOutcome = await this.generateSceneVideoWithAttempts(
            input,
            scene,
            scenePrompt,
            index,
            sceneReference
          );

          generatedSceneVideo = videoAttemptOutcome.result;
          videoGenerationError = videoAttemptOutcome.errorMessage;
        }

        if (generatedSceneVideo) {
          visualProvider = generatedSceneVideo.provider;
          await writeFile(sceneClipAbsolutePath, generatedSceneVideo.buffer);
          await this.processingProgressService.heartbeat(
            input.projectId,
            this.sceneRenderProgress(index + 1, input.scenes.length),
            `Cena ${index + 1} gerada diretamente em video por IA.`,
            {
              stage: 'rendering',
              message: `Cena ${index + 1} gerada diretamente em video por IA.`,
              provider: generatedSceneVideo.provider
            }
          );
          this.logger.log(
            `Scene ${index + 1}/${input.scenes.length} [${scene.title}]: provider=${generatedSceneVideo.provider}`
          );
        } else {
          let generatedSceneImage = null;
          if (scenePrompt) {
            try {
              generatedSceneImage = await this.sceneImageGenerationService.generate({
                organizationId: input.organizationId,
                projectId: input.projectId,
              sceneIndex: index,
              sceneTitle: scene.title,
              positivePrompt: scenePrompt.positivePrompt,
              negativePrompt: scenePrompt.negativePrompt,
              style: scenePrompt.style,
              camera: scenePrompt.camera,
              checkpointName: input.visualCheckpointName
            });
            } catch (error) {
              imageGenerationError = this.toErrorMessage(error);
              await this.processingProgressService.heartbeat(
                input.projectId,
                this.sceneRenderProgress(index, input.scenes.length),
                `Falha ao gerar a cena ${index + 1} em imagem no ComfyUI.`,
                {
                  stage: 'rendering',
                  message: `Falha de imagem IA na cena ${index + 1}: ${imageGenerationError}`,
                  provider: 'comfyui-image'
                }
              );
              this.logger.warn(
                `Scene ${index + 1}/${input.scenes.length} [${scene.title}] image generation failed: ${imageGenerationError}`
              );
            }
          }

          if (generatedSceneImage) {
            visualProvider = generatedSceneImage.provider;

            await this.prismaService.asset.create({
              data: {
                organizationId: input.organizationId,
                projectId: input.projectId,
                type: AssetType.image,
                mimeType: 'image/png',
                storagePath: generatedSceneImage.storagePath,
                sizeBytes: generatedSceneImage.sizeBytes
              }
            });

            await this.ffmpegRenderingService.createSceneClipFromImage(
              sceneClipAbsolutePath,
              scene.durationSeconds,
              this.renderStorageService.getAbsolutePath(generatedSceneImage.storagePath)
            );
            await this.processingProgressService.heartbeat(
              input.projectId,
              this.sceneRenderProgress(index + 1, input.scenes.length),
              `Cena ${index + 1} renderizada a partir de imagem gerada por IA.`,
              {
                stage: 'rendering',
                message: `Cena ${index + 1} renderizada a partir de imagem gerada por IA.`,
                provider: generatedSceneImage.provider
              }
            );
            this.logger.log(
              `Scene ${index + 1}/${input.scenes.length} [${scene.title}]: provider=${generatedSceneImage.provider}`
            );
          } else {
            const generationFailureMessage = this.buildSceneGenerationFailureMessage(
              index,
              scene.title,
              videoGenerationError,
              imageGenerationError
            );

            if (!this.shouldAllowProceduralFallback()) {
              await this.failScene(
                input.projectId,
                scene.id,
                generationFailureMessage,
                index,
                input.scenes.length
              );
              throw new Error(generationFailureMessage);
            }

            visualProvider = 'procedural';

            this.logger.warn(
              `Scene ${index + 1}/${input.scenes.length} [${scene.title}]: ` +
                `FALLBACK to procedural (solid color). ${generationFailureMessage}`
            );

            await this.ffmpegRenderingService.createSceneClip(
              sceneClipAbsolutePath,
              scene.durationSeconds,
              this.resolveSceneColor(scene.sectionType, index)
            );
            await this.processingProgressService.heartbeat(
              input.projectId,
              this.sceneRenderProgress(index + 1, input.scenes.length),
              `Cena ${index + 1} usou FALLBACK procedural (tela colorida). A geracao por IA falhou.`,
              {
                stage: 'rendering',
                message:
                  `Cena ${index + 1} usou FALLBACK procedural (tela colorida). ` +
                  `Motivo: ${generationFailureMessage}`,
                provider: 'procedural'
              }
            );
          }
        }

        const sceneClipSize = Number((await stat(sceneClipAbsolutePath)).size);
        previousContinuityFramePath = await this.extractContinuityFrame(
          input,
          index,
          sceneClipAbsolutePath
        );
        const sceneAsset = await this.prismaService.asset.create({
          data: {
            organizationId: input.organizationId,
            projectId: input.projectId,
            type: AssetType.video_scene,
            mimeType: 'video/mp4',
            storagePath: sceneClipPath,
            sizeBytes: sceneClipSize
          }
        });

        await this.prismaService.scene.update({
          where: {
            id: scene.id
          },
          data: {
            status: SceneStatus.completed,
            visualProvider,
            videoAssetId: sceneAsset.id
          }
        });

        sceneClipPaths.push(sceneClipPath);
        await this.processingProgressService.heartbeat(
          input.projectId,
          this.sceneRenderProgress(index + 1, input.scenes.length),
          `Cena ${index + 1} concluida (provider: ${visualProvider}) e anexada ao render final.`,
          {
            stage: 'rendering',
            message: `Cena ${index + 1} concluida (provider: ${visualProvider}) e anexada ao render final.`
          }
        );
      }

      const concatListPath = this.renderStorageService.buildConcatListPath(input.projectId);
      const concatListAbsolutePath = await this.renderStorageService.writeConcatList(
        concatListPath,
        sceneClipPaths
      );
      const intermediateVideoPath = this.renderStorageService.buildIntermediateVideoPath(
        input.projectId
      );
      const intermediateVideoAbsolutePath =
        await this.renderStorageService.ensureParentDirectory(intermediateVideoPath);

      await this.ffmpegRenderingService.concatSceneClips(
        concatListAbsolutePath,
        intermediateVideoAbsolutePath
      );
      await this.processingProgressService.heartbeat(
        input.projectId,
        96,
        'Todas as cenas foram concatenadas em um unico video intermediario.',
        {
          stage: 'rendering',
          message: 'Concatenando todas as cenas em um unico video.'
        }
      );

      const finalRenderPath = this.renderStorageService.buildFinalRenderPath(
        input.organizationId,
        input.projectId
      );
      const finalRenderAbsolutePath =
        await this.renderStorageService.ensureParentDirectory(finalRenderPath);

      if (input.audioPath) {
        await this.ffmpegRenderingService.muxAudio(
          intermediateVideoAbsolutePath,
          this.renderStorageService.getAbsolutePath(input.audioPath),
          finalRenderAbsolutePath
        );
      } else {
        await copyFile(intermediateVideoAbsolutePath, finalRenderAbsolutePath);
      }
      await this.processingProgressService.heartbeat(
        input.projectId,
        99,
        input.audioPath
          ? 'Faixa de audio sincronizada. Finalizando o MP4 de saida.'
          : 'Video sem trilha de audio finalizado. Preparando o MP4 de saida.',
        {
          stage: 'rendering',
          message: input.audioPath
            ? 'Sincronizando a faixa de audio com o video final.'
            : 'Finalizando o video gerado a partir da descricao.'
        }
      );

      const renderAsset = await this.prismaService.asset.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          type: AssetType.render,
          mimeType: 'video/mp4',
          storagePath: finalRenderPath,
          sizeBytes: Number((await stat(finalRenderAbsolutePath)).size)
        }
      });

      await this.prismaService.render.update({
        where: {
          id: renderRecord.id
        },
        data: {
          status: RenderStatus.completed,
          assetId: renderAsset.id,
          durationSeconds: input.durationSeconds
        }
      });
    } catch (error) {
      await this.prismaService.render.update({
        where: {
          id: renderRecord.id
        },
        data: {
          status: RenderStatus.failed,
          durationSeconds: input.durationSeconds
        }
      });

      throw error;
    }
  }

  private async generateSceneVideoWithAttempts(
    input: RenderProjectInput,
    scene: RenderSceneInput,
    scenePrompt: ScenePrompt,
    sceneIndex: number,
    reference: SceneReferenceInput
  ): Promise<SceneVideoAttemptOutcome> {
    if (this.configService.get<string>('visual.provider', 'procedural') !== 'comfyui') {
      return {
        result: null,
        errorMessage: null,
        restarted: false
      };
    }

    let restarted = false;

    for (;;) {
      const attempt = await this.createSceneRenderAttempt(input, scene, sceneIndex, reference);

      try {
        const result = await this.sceneVideoGenerationService.generate({
          sceneId: scene.id,
          positivePrompt: scenePrompt.positivePrompt,
          negativePrompt: scenePrompt.negativePrompt,
          width: this.configService.get<number>('visual.comfyuiWidth', 640),
          height: this.configService.get<number>('visual.comfyuiHeight', 360),
          durationSeconds: scene.durationSeconds,
          referenceImagePath: reference.path,
          onSubmitted: (promptId) => this.markSceneRenderAttemptSubmitted(attempt.id, promptId),
          onHeartbeat: (heartbeat) =>
            this.heartbeatSceneRenderAttempt(input, scene, sceneIndex, attempt.id, heartbeat),
          shouldCancel: () => this.shouldCancelSceneRenderAttempt(attempt.id)
        });

        if (result) {
          await this.finishSceneRenderAttempt(attempt.id, SceneRenderAttemptStatus.completed);
        } else {
          await this.finishSceneRenderAttempt(attempt.id, SceneRenderAttemptStatus.abandoned);
        }

        return {
          result,
          errorMessage: null,
          restarted
        };
      } catch (error) {
        if (error instanceof ComfyUiGenerationCancelledError) {
          restarted = true;
          await this.finishSceneRenderAttempt(
            attempt.id,
            SceneRenderAttemptStatus.abandoned,
            error.message
          );
          await this.processingProgressService.heartbeat(
            input.projectId,
            this.sceneRenderProgress(sceneIndex, input.scenes.length),
            `Reiniciando render da cena ${sceneIndex + 1} por solicitacao do usuario.`,
            {
              stage: 'rendering',
              message:
                `Tentativa ${attempt.attemptNumber} da cena ${sceneIndex + 1} abandonada. ` +
                'Uma nova tentativa sera iniciada.',
              provider: 'comfyui-video'
            }
          );
          continue;
        }

        const message = this.toErrorMessage(error);
        await this.finishSceneRenderAttempt(
          attempt.id,
          SceneRenderAttemptStatus.failed,
          message
        );
        await this.processingProgressService.heartbeat(
          input.projectId,
          this.sceneRenderProgress(sceneIndex, input.scenes.length),
          `Falha ao gerar a cena ${sceneIndex + 1} em video no ComfyUI.`,
          {
            stage: 'rendering',
            message: `Falha de video IA na cena ${sceneIndex + 1}: ${message}`,
            provider: 'comfyui-video'
          }
        );
        this.logger.warn(
          `Scene ${sceneIndex + 1}/${input.scenes.length} [${scene.title}] video generation failed: ${message}`
        );

        return {
          result: null,
          errorMessage: message,
          restarted
        };
      }
    }
  }

  private async createSceneRenderAttempt(
    input: RenderProjectInput,
    scene: RenderSceneInput,
    sceneIndex: number,
    reference?: SceneReferenceInput
  ) {
    const latestAttempt = await this.prismaService.sceneRenderAttempt.findFirst({
      where: {
        sceneId: scene.id
      },
      orderBy: {
        attemptNumber: 'desc'
      }
    });
    const attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;
    const fps = this.configService.get<number>('visual.comfyuiVideoFps', 24);
    const expectedFrameCount = Math.max(1, Math.round(scene.durationSeconds * fps) + 1);

    return this.prismaService.sceneRenderAttempt.create({
      data: {
        projectId: input.projectId,
        sceneId: scene.id,
        attemptNumber,
        provider: 'comfyui-video',
        status: SceneRenderAttemptStatus.queued,
        sourceType: reference?.sourceType ?? (scene.referenceImageStoragePath ? 'reference-image' : 'prompt'),
        hasReferenceImage: Boolean(reference?.path ?? scene.referenceImageStoragePath),
        width: this.configService.get<number>('visual.comfyuiWidth', 640),
        height: this.configService.get<number>('visual.comfyuiHeight', 360),
        fps,
        durationSeconds: scene.durationSeconds,
        expectedFrameCount,
        steps: this.configService.get<number>('visual.comfyuiSteps', 20),
        cfg: this.configService.get<number>('visual.comfyuiCfg', 5),
        sampler: this.configService.get<string>('visual.comfyuiSampler', 'uni_pc'),
        scheduler: this.configService.get<string>('visual.comfyuiScheduler', 'simple'),
        checkpointName: input.visualCheckpointName,
        unetName: this.configService.get<string>('visual.comfyuiVideoUnetName') ?? null,
        clipName: this.configService.get<string>('visual.comfyuiVideoClipName') ?? null,
        clipType: this.configService.get<string>('visual.comfyuiVideoClipType') ?? null,
        vaeName: this.configService.get<string>('visual.comfyuiVideoVaeName') ?? null,
        modelShift: this.configService.get<number>('visual.comfyuiVideoModelShift', 8),
        metadata: {
          sceneIndex,
          sceneTitle: scene.title,
          totalScenes: input.scenes.length,
          hasManualReferenceImage: reference?.hasManualReferenceImage ?? Boolean(scene.referenceImageStoragePath),
          hasContinuityFrame: reference?.hasContinuityFrame ?? false
        }
      }
    });
  }

  private async markSceneRenderAttemptSubmitted(
    attemptId: string,
    promptId: string
  ): Promise<void> {
    await this.prismaService.sceneRenderAttempt.update({
      where: {
        id: attemptId
      },
      data: {
        promptId,
        submittedAt: new Date(),
        lastHeartbeatAt: new Date(),
        status: SceneRenderAttemptStatus.waiting_external
      }
    });
  }

  private async heartbeatSceneRenderAttempt(
    input: RenderProjectInput,
    scene: RenderSceneInput,
    sceneIndex: number,
    attemptId: string,
    heartbeat: ComfyUiHeartbeat
  ): Promise<void> {
    const currentAttempt = await this.prismaService.sceneRenderAttempt.findUnique({
      where: {
        id: attemptId
      }
    });

    if (!currentAttempt) {
      return;
    }

    const status =
      heartbeat.state === 'history_seen'
        ? SceneRenderAttemptStatus.confirmed_external_active
        : SceneRenderAttemptStatus.waiting_external;
    const now = new Date();
    const elapsedMinutes = Math.max(1, Math.floor(heartbeat.elapsedMs / 60000));

    await this.prismaService.sceneRenderAttempt.update({
      where: {
        id: attemptId
      },
      data: {
        status,
        lastHeartbeatAt: now,
        firstExternalSeenAt:
          heartbeat.state === 'history_seen' && !currentAttempt.firstExternalSeenAt
            ? now
            : currentAttempt.firstExternalSeenAt
      }
    });
    await this.processingProgressService.heartbeat(
      input.projectId,
      this.sceneRenderProgress(sceneIndex, input.scenes.length),
      `Cena ${sceneIndex + 1} de ${input.scenes.length} ainda aguardando o ComfyUI ha ${elapsedMinutes} min.`,
      {
        stage: 'rendering',
        message:
          `Confirmacao periodica: cena ${sceneIndex + 1} de ${input.scenes.length} ` +
          `continua aguardando o ComfyUI ha ${elapsedMinutes} min. Prompt: ${heartbeat.promptId}.`,
        provider: 'comfyui-video'
      }
    );
    this.logger.log(
      `Scene ${sceneIndex + 1}/${input.scenes.length} [${scene.title}] heartbeat: ` +
        `prompt=${heartbeat.promptId}, elapsedMs=${heartbeat.elapsedMs}, polls=${heartbeat.pollCount}`
    );
  }

  private async shouldCancelSceneRenderAttempt(attemptId: string): Promise<boolean> {
    const attempt = await this.prismaService.sceneRenderAttempt.findUnique({
      where: {
        id: attemptId
      },
      select: {
        status: true
      }
    });

    return (
      attempt?.status === SceneRenderAttemptStatus.abandoned ||
      attempt?.status === SceneRenderAttemptStatus.cancelled
    );
  }

  private async finishSceneRenderAttempt(
    attemptId: string,
    status: SceneRenderAttemptStatus,
    errorMessage?: string
  ): Promise<void> {
    const attempt = await this.prismaService.sceneRenderAttempt.findUnique({
      where: {
        id: attemptId
      },
      select: {
        startedAt: true
      }
    });
    const finishedAt = new Date();

    await this.prismaService.sceneRenderAttempt.update({
      where: {
        id: attemptId
      },
      data: {
        status,
        finishedAt,
        lastHeartbeatAt: finishedAt,
        durationMs: attempt ? finishedAt.getTime() - attempt.startedAt.getTime() : null,
        errorMessage: errorMessage ?? null
      }
    });
  }

  private resolveSceneReference(
    scene: RenderSceneInput,
    previousContinuityFramePath: string | null
  ): SceneReferenceInput {
    if (previousContinuityFramePath) {
      return {
        path: previousContinuityFramePath,
        sourceType: scene.referenceImageStoragePath
          ? 'continuity-frame-with-manual-reference'
          : 'continuity-frame',
        hasManualReferenceImage: Boolean(scene.referenceImageStoragePath),
        hasContinuityFrame: true
      };
    }

    return {
      path: scene.referenceImageStoragePath
        ? this.renderStorageService.getAbsolutePath(scene.referenceImageStoragePath)
        : null,
      sourceType: scene.referenceImageStoragePath ? 'reference-image' : 'prompt',
      hasManualReferenceImage: Boolean(scene.referenceImageStoragePath),
      hasContinuityFrame: false
    };
  }

  private async extractContinuityFrame(
    input: RenderProjectInput,
    sceneIndex: number,
    sceneClipAbsolutePath: string
  ): Promise<string | null> {
    const continuityFramePath = this.renderStorageService.buildContinuityFramePath(
      input.organizationId,
      input.projectId,
      sceneIndex
    );
    const continuityFrameAbsolutePath =
      await this.renderStorageService.ensureParentDirectory(continuityFramePath);

    try {
      await this.ffmpegRenderingService.extractLastFrame(
        sceneClipAbsolutePath,
        continuityFrameAbsolutePath
      );

      return continuityFrameAbsolutePath;
    } catch (error) {
      this.logger.warn(
        `Could not extract continuity frame for project=${input.projectId} ` +
          `scene=${sceneIndex + 1}: ${this.toErrorMessage(error)}`
      );
      return null;
    }
  }

  private resolveSceneColor(sectionType: string, index: number): string {
    const paletteBySectionType: Record<string, string[]> = {
      intro: ['0x1d3557', '0x264653'],
      verse: ['0x6d597a', '0x355070'],
      chorus: ['0xe76f51', '0xf4a261'],
      bridge: ['0x457b9d', '0x2a9d8f'],
      outro: ['0x3a506b', '0x5bc0be'],
      instrumental: ['0x4a4e69', '0x9a8c98']
    };
    const palette = paletteBySectionType[sectionType] ?? ['0x355070', '0x6d597a'];

    return palette[index % palette.length];
  }

  private sceneRenderProgress(renderedScenes: number, totalScenes: number): number {
    if (totalScenes <= 0) {
      return 95;
    }

    const progress = 85 + Math.round((renderedScenes / totalScenes) * 10);
    return Math.min(progress, 95);
  }

  private shouldAllowProceduralFallback(): boolean {
    const visualProvider = this.configService.get<string>('visual.provider', 'procedural');
    const enableFallbacks = this.configService.get<boolean>('ai.enableFallbacks', true);

    return visualProvider !== 'comfyui' && enableFallbacks;
  }

  private buildSceneGenerationFailureMessage(
    sceneIndex: number,
    sceneTitle: string,
    videoGenerationError: string | null,
    imageGenerationError: string | null
  ): string {
    const reasons = [
      videoGenerationError ? `video: ${videoGenerationError}` : null,
      imageGenerationError ? `imagem: ${imageGenerationError}` : null
    ].filter(Boolean);

    if (reasons.length === 0) {
      reasons.push('nenhum artefato foi retornado pelo pipeline visual');
    }

    return `Cena ${sceneIndex + 1} (${sceneTitle}) falhou na geracao visual: ${reasons.join(' | ')}.`;
  }

  private async failScene(
    projectId: string,
    sceneId: string,
    message: string,
    sceneIndex: number,
    totalScenes: number
  ): Promise<void> {
    await this.prismaService.scene.update({
      where: {
        id: sceneId
      },
      data: {
        status: SceneStatus.failed
      }
    });

    await this.processingProgressService.heartbeat(
      projectId,
      this.sceneRenderProgress(sceneIndex, totalScenes),
      message,
      {
        stage: 'rendering',
        message,
        provider: 'comfyui'
      }
    );
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async pathExists(absolutePath: string): Promise<boolean> {
    try {
      await stat(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
