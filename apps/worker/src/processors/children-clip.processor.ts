import { stat, writeFile } from 'node:fs/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetType, CharacterAssetRole, CharacterVersionStatus, Prisma, ProcessingJobStatus } from '@prisma/client';
import type { ChildrenClipCharacterGenerationJobPayload } from '@video/shared';
import type { Job } from 'bullmq';

import { PrismaService } from '../database/prisma.service';
import { ComfyUiClientService } from '../services/comfyui-client.service';
import { RenderStorageService } from '../services/render-storage.service';
import { OllamaClientService } from '../services/ollama-client.service';

interface OptimizedCharacterPrompt {
  positivePrompt: string;
  negativePrompt: string;
}

@Injectable()
export class ChildrenClipProcessor {
  private readonly logger = new Logger(ChildrenClipProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ComfyUiClientService) private readonly comfyUi: ComfyUiClientService,
    @Inject(RenderStorageService) private readonly storage: RenderStorageService,
    @Inject(OllamaClientService) private readonly ollama: OllamaClientService
  ) {}

  async processCharacterGeneration(job: Job<ChildrenClipCharacterGenerationJobPayload>) {
    const { projectId, organizationId, characterId, characterVersionId } = job.data;
    const bullJobId = String(job.id);
    const version = await this.prisma.characterVersion.findFirst({
      where: {
        id: characterVersionId,
        characterId,
        character: {
          organizationId,
          projectLinks: { some: { projectId } }
        }
      },
      include: { character: true }
    });
    if (!version?.generationPrompt) {
      throw new Error(`Character version ${characterVersionId} is not ready for generation`);
    }

    const seed = version.seed ?? Math.floor(Math.random() * 2_147_483_646);
    const checkpointName = this.config.get<string>('visual.characterCheckpointName', '').trim();
    const width = this.config.get<number>('visual.characterWidth', 1024);
    const height = this.config.get<number>('visual.characterHeight', 1024);
    const steps = this.config.get<number>('visual.characterSteps', 30);
    const cfg = this.config.get<number>('visual.characterCfg', 6.5);
    const sampler = this.config.get<string>('visual.characterSampler', 'dpmpp_2m');
    const scheduler = this.config.get<string>('visual.characterScheduler', 'karras');
    const loraName = this.config.get<string>('visual.characterLoraName', '').trim();
    const loraStrength = this.config.get<number>('visual.characterLoraStrength', 1);

    await this.prisma.characterVersion.update({
      where: { id: characterVersionId },
      data: {
        status: CharacterVersionStatus.generating,
        bullJobId,
        seed,
        errorMessage: null,
        generationStartedAt: new Date(),
        generationCompletedAt: null
      }
    });
    await this.progress(bullJobId, 10, 'STARTING', 'Worker iniciou a geracao da ficha do personagem.');

    try {
      await this.progress(bullJobId, 15, 'OPTIMIZING_PROMPT', 'Traduzindo e estruturando a descricao visual.');
      const optimizedPrompt = await this.ollama.generateJson<OptimizedCharacterPrompt>([
        {
          role: 'system',
          content:
            'You convert Portuguese or English character descriptions into precise English SDXL prompts. ' +
            'Preserve every physical trait, species, outfit, accessory and color. Never invent a human when the source describes an animal. ' +
            'Return JSON with positivePrompt and negativePrompt only. The positive prompt must describe one original 2D children animation character turnaround sheet with front, side and back views and consistent identity.'
        },
        {
          role: 'user',
          content: version.generationPrompt
        }
      ]);
      const positivePrompt = [
        'flat 2D vector cartoon, simple cel shading, clean bold outlines, colorful original children animation design',
        optimizedPrompt?.positivePrompt?.trim() || version.generationPrompt
      ].join(', ');
      const safetyNegativePrompt =
        'photorealistic, realistic skin, 3d render, realistic fur, realistic feathers, text, letters, logo, watermark, signature, human when animal is requested, multiple different characters, inconsistent outfit, cropped body, extra arms, extra legs, malformed hands, duplicate body';
      const negativePrompt = [optimizedPrompt?.negativePrompt?.trim(), safetyNegativePrompt]
        .filter(Boolean)
        .join(', ');
      await this.progress(bullJobId, 20, 'LOADING_MODEL', `Carregando checkpoint ${checkpointName}.`);
      const result = await this.comfyUi.generateStillImage({
        positivePrompt,
        negativePrompt,
        checkpointName,
        width,
        height,
        steps,
        cfg,
        sampler,
        scheduler,
        seed,
        filenamePrefix: `children-clips/character-${characterId}-v${version.versionNumber}`,
        loraName: loraName || null,
        loraStrength
      });
      await this.progress(bullJobId, 75, 'SAVING_ASSET', 'Imagem gerada. Salvando ficha versionada.');

      const storagePath = this.storage.buildCharacterAssetPath(
        organizationId,
        projectId,
        characterId,
        version.versionNumber
      );
      const absolutePath = await this.storage.ensureParentDirectory(storagePath);
      await writeFile(absolutePath, result.buffer);
      const sizeBytes = Number((await stat(absolutePath)).size);

      await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            organizationId,
            projectId,
            type: AssetType.image,
            mimeType: 'image/png',
            storagePath,
            sizeBytes,
            width,
            height,
            metadata: {
              source: 'comfyui',
              characterId,
              characterVersionId,
              promptId: result.promptId,
              checkpointName,
              seed,
              steps,
              cfg,
              sampler,
              scheduler,
              loraName: loraName || null,
              loraStrength,
              positivePrompt,
              negativePrompt
            }
          }
        });
        await tx.characterAsset.create({
          data: {
            characterVersionId,
            assetId: asset.id,
            role: CharacterAssetRole.primary_reference,
            label: 'Ficha gerada pelo sistema',
            sortOrder: await tx.characterAsset.count({ where: { characterVersionId } })
          }
        });
        await tx.characterVersion.update({
          where: { id: characterVersionId },
          data: {
            status: CharacterVersionStatus.ready_for_review,
            generationCompletedAt: new Date(),
            generationMetadata: {
              provider: result.provider,
              promptId: result.promptId,
              checkpointName,
              width,
              height,
              seed,
              steps,
              cfg,
              sampler,
              scheduler,
              loraName: loraName || null,
              loraStrength,
              positivePrompt
            },
            errorMessage: null
          }
        });
      });
      await this.progress(bullJobId, 100, 'READY_FOR_REVIEW', 'Ficha do personagem pronta para revisao.', ProcessingJobStatus.completed);
      this.logger.log(`Character generated project=${projectId} character=${characterId} version=${characterVersionId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.characterVersion.update({
        where: { id: characterVersionId },
        data: {
          status: CharacterVersionStatus.failed,
          errorMessage: message,
          generationCompletedAt: new Date()
        }
      });
      await this.progress(bullJobId, 0, 'FAILED', `Falha ao gerar personagem: ${message}`, ProcessingJobStatus.failed, message);
      throw error;
    }
  }

  private async progress(
    bullJobId: string,
    progress: number,
    stage: string,
    message: string,
    status: ProcessingJobStatus = ProcessingJobStatus.active,
    errorMessage: string | null = null
  ) {
    const processingJob = await this.prisma.processingJob.findFirst({ where: { bullJobId } });
    if (!processingJob) return;
    const entries = Array.isArray(processingJob.activityLog) ? [...processingJob.activityLog] : [];
    entries.push({ stage, message, progress, timestamp: new Date().toISOString() });
    await this.prisma.processingJob.update({
      where: { id: processingJob.id },
      data: {
        status,
        progress,
        detailMessage: message,
        errorMessage,
        activityLog: entries.slice(-200) as Prisma.InputJsonValue
      }
    });
  }
}
