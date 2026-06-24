import { stat, writeFile } from 'node:fs/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { AssetType, RenderStatus, SceneStatus } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { FfmpegRenderingService } from './ffmpeg-rendering.service';
import { ProcessingProgressService } from './processing-progress.service';
import { RenderStorageService } from './render-storage.service';
import { SceneImageGenerationService } from './scene-image-generation.service';
import { SceneVideoGenerationService } from './scene-video-generation.service';

interface RenderSceneInput {
  id: string;
  title: string;
  durationSeconds: number;
  sectionType: string;
}

interface RenderProjectInput {
  organizationId: string;
  projectId: string;
  audioPath: string;
  durationSeconds: number;
  scenes: RenderSceneInput[];
}

@Injectable()
export class ProjectRenderService {
  private readonly logger = new Logger(ProjectRenderService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prismaService: PrismaService,
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

      for (const [index, scene] of input.scenes.entries()) {
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

        let visualProvider: string = 'procedural';

        // Attempt 1: Generate video directly via ComfyUI
        const generatedSceneVideo = scenePrompt
          ? await this.sceneVideoGenerationService.generate({
              sceneId: scene.id,
              positivePrompt: scenePrompt.positivePrompt,
              negativePrompt: scenePrompt.negativePrompt,
              width: 1280,
              height: 704,
              durationSeconds: scene.durationSeconds
            })
          : null;

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
          // Attempt 2: Generate image via ComfyUI, then create video clip from still image
          const generatedSceneImage = scenePrompt
            ? await this.sceneImageGenerationService.generate({
                organizationId: input.organizationId,
                projectId: input.projectId,
                sceneIndex: index,
                sceneTitle: scene.title,
                positivePrompt: scenePrompt.positivePrompt,
                negativePrompt: scenePrompt.negativePrompt,
                style: scenePrompt.style,
                camera: scenePrompt.camera
              })
            : null;

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
            // Attempt 3: Procedural fallback — solid color
            visualProvider = 'procedural';

            this.logger.warn(
              `Scene ${index + 1}/${input.scenes.length} [${scene.title}]: ` +
                `FALLBACK to procedural (solid color). Both ComfyUI video and image generation failed or returned null.`
            );

            await this.ffmpegRenderingService.createSceneClip(
              sceneClipAbsolutePath,
              scene.durationSeconds,
              this.resolveSceneColor(scene.sectionType, index)
            );
            await this.processingProgressService.heartbeat(
              input.projectId,
              this.sceneRenderProgress(index + 1, input.scenes.length),
              `⚠️ Cena ${index + 1} usou FALLBACK procedural (tela colorida). A geracao por IA falhou.`,
              {
                stage: 'rendering',
                message: `⚠️ Cena ${index + 1} usou FALLBACK procedural (tela colorida). A geracao por IA falhou.`,
                provider: 'procedural'
              }
            );
          }
        }

        const sceneClipSize = Number((await stat(sceneClipAbsolutePath)).size);
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

      await this.ffmpegRenderingService.muxAudio(
        intermediateVideoAbsolutePath,
        this.renderStorageService.getAbsolutePath(input.audioPath),
        finalRenderAbsolutePath
      );
      await this.processingProgressService.heartbeat(
        input.projectId,
        99,
        'Faixa de audio sincronizada. Finalizando o MP4 de saida.',
        {
          stage: 'rendering',
          message: 'Sincronizando a faixa de audio com o video final.'
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
}
