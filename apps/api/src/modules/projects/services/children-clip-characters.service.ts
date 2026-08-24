import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CharacterAssetOrigin, CharacterAssetRole, CharacterAssetStatus, CharacterVersionStatus, Prisma, ProcessingJobStatus } from '@prisma/client';
import {
  CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME,
  CHILDREN_CLIP_QUEUE_NAME
} from '@video/shared';
import { imageSize } from 'image-size';

import { PrismaService } from '../../../database/prisma.service';
import { ChildrenClipQueueService } from '../../jobs/services/children-clip-queue.service';
import type { CreateCharacterDto } from '../dtos/create-character.dto';
import type { CreateCharacterVersionDto } from '../dtos/create-character-version.dto';
import type { UploadCharacterAssetDto } from '../dtos/upload-character-asset.dto';
import type { AttachLibraryCharacterDto } from '../dtos/attach-library-character.dto';
import type { GenerateCharacterAssetDto } from '../dtos/generate-character-asset.dto';
import { LocalStorageService } from './local-storage.service';
import { ChildrenClipStyleProfileService } from './children-clip-style-profile.service';

@Injectable()
export class ChildrenClipCharactersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService,
    @Inject(ChildrenClipStyleProfileService) private readonly styles: ChildrenClipStyleProfileService
  ) {}

  async list(projectId: string, organizationId: string) {
    await this.getOwnedChildrenClip(projectId, organizationId);
    const links = await this.prisma.projectCharacter.findMany({
      where: { projectId, character: { deletedAt: null } },
      include: {
        selectedVersion: true,
        character: {
          include: {
            versions: {
              include: { assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } } },
              orderBy: { versionNumber: 'desc' }
            }
          }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    return links.map((link) => this.presentCharacter(link));
  }

  async listLibrary(projectId: string, organizationId: string) {
    await this.getOwnedChildrenClip(projectId, organizationId);
    const linked = await this.prisma.projectCharacter.findMany({ where: { projectId }, select: { characterId: true } });
    const characters = await this.prisma.character.findMany({
      where: {
        organizationId,
        scope: 'organization',
        deletedAt: null,
        approvedVersionId: { not: null },
        id: { notIn: linked.map((item) => item.characterId) }
      },
      include: { approvedVersion: { include: { assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } } } } },
      orderBy: { name: 'asc' }
    });
    return characters.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      approvedVersionId: character.approvedVersionId,
      versionNumber: character.approvedVersion?.versionNumber ?? null,
      previewAssetId: character.approvedVersion?.assets.find((item) => item.role === 'primary_reference')?.assetId
        ?? character.approvedVersion?.assets[0]?.assetId
        ?? null
    }));
  }

  async attachLibrary(
    projectId: string,
    characterId: string,
    organizationId: string,
    input: AttachLibraryCharacterDto
  ) {
    await this.getOwnedChildrenClip(projectId, organizationId);
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, organizationId, scope: 'organization', deletedAt: null },
      include: { approvedVersion: true }
    });
    if (!character?.approvedVersion) {
      throw new BadRequestException('O personagem da biblioteca precisa possuir uma versao aprovada');
    }
    const exists = await this.prisma.projectCharacter.findUnique({
      where: { projectId_characterId: { projectId, characterId } }
    });
    if (exists) throw new BadRequestException('Este personagem ja faz parte do projeto');
    await this.prisma.projectCharacter.create({
      data: {
        projectId,
        characterId,
        selectedVersionId: character.approvedVersion.id,
        roleName: input.roleName?.trim() || null,
        sortOrder: await this.prisma.projectCharacter.count({ where: { projectId } })
      }
    });
    await this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'designing_characters' } });
    return (await this.list(projectId, organizationId)).find((item) => item.id === characterId);
  }

  async create(
    projectId: string,
    organizationId: string,
    createdByUserId: string,
    input: CreateCharacterDto
  ) {
    const project = await this.getOwnedChildrenClip(projectId, organizationId);
    const description = input.description.trim();
    const generationPrompt = this.buildGenerationPrompt(
      input.name.trim(),
      description,
      input.invariants ?? [],
      project.childrenClip!.visualStyle
    );

    const character = await this.prisma.character.create({
      data: {
        organizationId,
        createdByUserId,
        originProjectId: projectId,
        name: input.name.trim(),
        description,
        scope: input.scope ?? 'project',
        versions: {
          create: {
            versionNumber: 1,
            origin: input.sourceMode,
            status: CharacterVersionStatus.draft,
            description,
            generationPrompt: input.sourceMode === 'generated' ? generationPrompt : null,
            invariants: (input.invariants ?? []) as Prisma.InputJsonValue
          }
        },
        projectLinks: {
          create: {
            projectId,
            roleName: input.roleName?.trim() || null,
            sortOrder: await this.prisma.projectCharacter.count({ where: { projectId } })
          }
        }
      },
      include: { versions: true }
    });

    const version = character.versions[0];
    if (input.sourceMode === 'generated') {
      await this.enqueueGeneration(projectId, organizationId, createdByUserId, character.id, version.id);
    }

    return (await this.list(projectId, organizationId)).find((item) => item.id === character.id);
  }

  async createVersion(
    projectId: string,
    characterId: string,
    organizationId: string,
    requestedByUserId: string,
    input: CreateCharacterVersionDto
  ) {
    const character = await this.getOwnedCharacter(projectId, characterId, organizationId);
    const latest = await this.prisma.characterVersion.findFirst({
      where: { characterId },
      orderBy: { versionNumber: 'desc' }
    });
    const project = await this.getOwnedChildrenClip(projectId, organizationId);
    const description = input.description.trim();
    const version = await this.prisma.characterVersion.create({
      data: {
        characterId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        origin: input.origin,
        description,
        generationPrompt:
          input.origin === 'uploaded'
            ? null
            : this.buildGenerationPrompt(
                character.name,
                description,
                input.invariants ?? [],
                project.childrenClip!.visualStyle
              ),
        invariants: (input.invariants ?? []) as Prisma.InputJsonValue
      }
    });

    if (input.origin !== 'uploaded') {
      await this.enqueueGeneration(projectId, organizationId, requestedByUserId, characterId, version.id);
    }

    return this.getVersion(projectId, characterId, version.id, organizationId);
  }

  async retryGeneration(
    projectId: string,
    characterId: string,
    versionId: string,
    organizationId: string,
    requestedByUserId: string
  ) {
    const version = await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    if (!version.generationPrompt) {
      throw new BadRequestException('This character version does not have a generation prompt');
    }
    if (version.status === 'queued' || version.status === 'generating') {
      throw new BadRequestException('Character generation is already running');
    }

    await this.enqueueGeneration(projectId, organizationId, requestedByUserId, characterId, versionId);
    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async uploadAsset(
    projectId: string,
    characterId: string,
    versionId: string,
    organizationId: string,
    input: UploadCharacterAssetDto,
    file: Express.Multer.File
  ) {
    const version = await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    const label = input.label?.trim() || null;
    if (input.role === 'mouth_shape' && !['a', 'e', 'o', 'u', 'closed', 'rest'].includes((label ?? '').toLowerCase())) {
      throw new BadRequestException('Formas de boca precisam do rotulo A, E, O, U, closed ou rest');
    }
    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(new Uint8Array(file.buffer));
    } catch {
      throw new BadRequestException('Uploaded file is not a valid image');
    }
    if (!dimensions.width || !dimensions.height) {
      throw new BadRequestException('Could not determine image dimensions');
    }

    const storagePath = await this.storage.saveCharacterAsset(
      organizationId,
      projectId,
      characterId,
      version.versionNumber,
      input.role,
      file.originalname,
      file.buffer
    );
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          organizationId,
          projectId,
          type: 'image',
          mimeType: file.mimetype,
          storagePath,
          sizeBytes: file.size,
          width: dimensions.width,
          height: dimensions.height,
          metadata: { source: 'user_upload', characterId, characterVersionId: versionId }
        }
      });
      await tx.characterAsset.create({
        data: {
          characterVersionId: versionId,
          assetId: asset.id,
          role: input.role as CharacterAssetRole,
          origin: CharacterAssetOrigin.uploaded,
          status: CharacterAssetStatus.ready_for_review,
          label,
          sortOrder: await tx.characterAsset.count({ where: { characterVersionId: versionId } })
        }
      });
      await tx.characterVersion.update({
        where: { id: versionId },
        data: {
          origin: version.origin === 'generated' ? 'hybrid' : version.origin,
          status: version.status === CharacterVersionStatus.approved
            ? CharacterVersionStatus.approved
            : CharacterVersionStatus.ready_for_review,
          errorMessage: null
        }
      });
    });

    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async generateAsset(
    projectId: string,
    characterId: string,
    versionId: string,
    organizationId: string,
    requestedByUserId: string,
    input: GenerateCharacterAssetDto
  ) {
    const version = await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    if (version.status !== CharacterVersionStatus.approved) {
      throw new BadRequestException('Aprove a identidade principal antes de gerar complementos');
    }
    const label = input.label.trim();
    this.assertAssetLabel(input.role, label);
    const hasReference = await this.prisma.characterAsset.count({
      where: { characterVersionId: versionId, assetId: { not: null }, status: CharacterAssetStatus.approved }
    });
    if (!hasReference) throw new BadRequestException('O personagem precisa de uma referencia aprovada');
    const record = await this.prisma.characterAsset.create({
      data: {
        characterVersionId: versionId,
        role: input.role as CharacterAssetRole,
        origin: CharacterAssetOrigin.generated,
        status: CharacterAssetStatus.draft,
        label,
        generationPrompt: input.prompt?.trim() || `${input.role}: ${label}`,
        sortOrder: await this.prisma.characterAsset.count({ where: { characterVersionId: versionId } })
      }
    });
    await this.enqueueAssetGeneration(projectId, organizationId, requestedByUserId, characterId, versionId, record.id);
    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async retryAssetGeneration(
    projectId: string,
    characterId: string,
    versionId: string,
    characterAssetId: string,
    organizationId: string,
    requestedByUserId: string
  ) {
    const record = await this.getOwnedCharacterAsset(projectId, characterId, versionId, characterAssetId, organizationId);
    if (record.origin !== CharacterAssetOrigin.generated || !record.generationPrompt) {
      throw new BadRequestException('Somente assets gerados podem ser reenfileirados');
    }
    if (record.status === CharacterAssetStatus.queued || record.status === CharacterAssetStatus.generating) {
      throw new BadRequestException('A geracao deste asset ja esta em andamento');
    }
    await this.enqueueAssetGeneration(projectId, organizationId, requestedByUserId, characterId, versionId, record.id);
    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async approveAsset(projectId: string, characterId: string, versionId: string, characterAssetId: string, organizationId: string) {
    const record = await this.getOwnedCharacterAsset(projectId, characterId, versionId, characterAssetId, organizationId);
    if (!record.assetId || (record.status !== CharacterAssetStatus.ready_for_review && record.status !== CharacterAssetStatus.approved)) {
      throw new BadRequestException('O asset precisa estar pronto para revisao');
    }
    const changesCanonicalSource = record.status !== CharacterAssetStatus.approved && Boolean(await this.prisma.projectCharacter.findFirst({
      where: { projectId, selectedVersionId: versionId }, select: { id: true }
    }));
    await this.prisma.$transaction([
      this.prisma.characterAsset.updateMany({
        where: { characterVersionId: versionId, role: record.role, label: record.label, status: CharacterAssetStatus.approved, id: { not: record.id } },
        data: { status: CharacterAssetStatus.ready_for_review, approvedAt: null }
      }),
      this.prisma.characterAsset.update({
        where: { id: record.id }, data: { status: CharacterAssetStatus.approved, approvedAt: new Date(), errorMessage: null }
      })
    ]);
    if (changesCanonicalSource) {
      await this.styles.markStale(projectId, 'Um asset aprovado de personagem mudou. Atualize o Style Lock depois de revisar a nova referencia.');
    }
    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async rejectAsset(projectId: string, characterId: string, versionId: string, characterAssetId: string, organizationId: string) {
    const record = await this.getOwnedCharacterAsset(projectId, characterId, versionId, characterAssetId, organizationId);
    if (record.status !== CharacterAssetStatus.ready_for_review) {
      throw new BadRequestException('Somente um asset pronto para revisao pode ser rejeitado');
    }
    await this.prisma.characterAsset.update({
      where: { id: record.id }, data: { status: CharacterAssetStatus.rejected, approvedAt: null }
    });
    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async approve(
    projectId: string,
    characterId: string,
    versionId: string,
    organizationId: string
  ) {
    const version = await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    const assetCount = await this.prisma.characterAsset.count({ where: { characterVersionId: versionId } });
    if (assetCount === 0) {
      throw new BadRequestException('Add or generate at least one character image before approval');
    }
    if (version.status === 'queued' || version.status === 'generating') {
      throw new BadRequestException('Wait for character generation to finish before approval');
    }

    const currentLink = await this.prisma.projectCharacter.findUnique({
      where: { projectId_characterId: { projectId, characterId } }
    });
    const previousVersionId = currentLink?.selectedVersionId;
    const affectedShots = previousVersionId && previousVersionId !== versionId
      ? (await this.prisma.childrenClipShot.findMany({
          where: { projectId },
          select: { id: true, characterVersionIds: true }
        })).filter((shot) => Array.isArray(shot.characterVersionIds) && shot.characterVersionIds.includes(previousVersionId))
      : [];

    await this.prisma.$transaction([
      this.prisma.characterVersion.updateMany({
        where: { characterId, status: CharacterVersionStatus.approved },
        data: { status: CharacterVersionStatus.ready_for_review }
      }),
      this.prisma.characterVersion.update({
        where: { id: versionId },
        data: { status: CharacterVersionStatus.approved }
      }),
      this.prisma.characterAsset.updateMany({
        where: { characterVersionId: versionId, assetId: { not: null }, status: { in: [CharacterAssetStatus.ready_for_review, CharacterAssetStatus.approved] } },
        data: { status: CharacterAssetStatus.approved, approvedAt: new Date() }
      }),
      this.prisma.character.update({
        where: { id: characterId },
        data: { approvedVersionId: versionId }
      }),
      this.prisma.projectCharacter.update({
        where: { projectId_characterId: { projectId, characterId } },
        data: { selectedVersionId: versionId }
      }),
      ...(affectedShots.length ? [
        this.prisma.childrenClipShot.updateMany({
          where: { id: { in: affectedShots.map((shot) => shot.id) } },
          data: { status: 'needs_revision', revisionInstruction: 'A versao aprovada do personagem foi alterada.' }
        }),
        this.prisma.childrenClipPlan.updateMany({
          where: { projectId },
          data: { status: 'ready_for_review', approvedAt: null }
        }),
        this.prisma.childrenClip.update({
          where: { projectId },
          data: { productionStatus: 'storyboarding' }
        })
      ] : [])
    ]);

    if (previousVersionId && previousVersionId !== versionId) {
      await this.styles.markStale(projectId, 'A versao aprovada de um personagem mudou. Atualize o Style Lock depois de revisar os novos assets.');
    }

    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async reject(projectId: string, characterId: string, versionId: string, organizationId: string) {
    const version = await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    if (version.status !== CharacterVersionStatus.ready_for_review) {
      throw new BadRequestException('Somente uma versao pronta para revisao pode ser rejeitada');
    }
    await this.prisma.characterVersion.update({
      where: { id: versionId }, data: { status: CharacterVersionStatus.rejected }
    });
    return this.getVersion(projectId, characterId, versionId, organizationId);
  }

  async getAssetDownload(
    projectId: string,
    characterId: string,
    versionId: string,
    assetId: string,
    organizationId: string
  ) {
    await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    const link = await this.prisma.characterAsset.findFirst({
      where: { characterVersionId: versionId, OR: [{ id: assetId }, { assetId }] },
      include: { asset: true }
    });
    if (!link?.asset) throw new NotFoundException('Character asset not found');
    return {
      fileName: `character-${characterId}-${link.role}.${link.asset.mimeType.split('/')[1] ?? 'png'}`,
      absolutePath: this.storage.getAbsolutePath(link.asset.storagePath),
      mimeType: link.asset.mimeType
    };
  }

  private async enqueueGeneration(
    projectId: string,
    organizationId: string,
    requestedByUserId: string,
    characterId: string,
    characterVersionId: string
  ) {
    const queued = await this.queue.enqueueCharacterGeneration({
      projectId,
      organizationId,
      requestedByUserId,
      characterId,
      characterVersionId
    });
    await this.prisma.$transaction([
      this.prisma.characterVersion.update({
        where: { id: characterVersionId },
        data: {
          status: CharacterVersionStatus.queued,
          bullJobId: queued.bullJobId,
          errorMessage: null,
          generationStartedAt: null,
          generationCompletedAt: null
        }
      }),
      this.prisma.processingJob.create({
        data: {
          projectId,
          queueName: CHILDREN_CLIP_QUEUE_NAME,
          jobName: CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME,
          bullJobId: queued.bullJobId,
          status: ProcessingJobStatus.queued,
          progress: 0,
          detailMessage: 'Geracao do personagem enfileirada.',
          activityLog: [{
            stage: 'QUEUED',
            message: 'Geracao do personagem enfileirada.',
            characterId,
            characterVersionId,
            progress: 0,
            timestamp: new Date().toISOString()
          }]
        }
      })
    ]);
  }

  private async enqueueAssetGeneration(
    projectId: string,
    organizationId: string,
    requestedByUserId: string,
    characterId: string,
    characterVersionId: string,
    characterAssetId: string
  ) {
    const queued = await this.queue.enqueueCharacterGeneration({
      projectId, organizationId, requestedByUserId, characterId, characterVersionId, characterAssetId
    });
    await this.prisma.$transaction([
      this.prisma.characterAsset.update({
        where: { id: characterAssetId },
        data: { status: CharacterAssetStatus.queued, bullJobId: queued.bullJobId, errorMessage: null, generationStartedAt: null, generationEndedAt: null }
      }),
      this.prisma.processingJob.create({
        data: {
          projectId, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME,
          bullJobId: queued.bullJobId, status: ProcessingJobStatus.queued, progress: 0,
          detailMessage: 'Asset complementar do personagem enfileirado.',
          activityLog: [{ stage: 'QUEUED', message: 'Asset complementar do personagem enfileirado.', characterId, characterVersionId, characterAssetId, progress: 0, timestamp: new Date().toISOString() }]
        }
      })
    ]);
  }

  private async getOwnedChildrenClip(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null, generationMode: 'children_clip' },
      include: { childrenClip: true }
    });
    if (!project?.childrenClip) throw new NotFoundException('Children clip project not found');
    return project;
  }

  private async getOwnedCharacter(projectId: string, characterId: string, organizationId: string) {
    await this.getOwnedChildrenClip(projectId, organizationId);
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, organizationId, deletedAt: null, projectLinks: { some: { projectId } } }
    });
    if (!character) throw new NotFoundException('Character not found');
    return character;
  }

  private async getOwnedVersion(projectId: string, characterId: string, versionId: string, organizationId: string) {
    await this.getOwnedCharacter(projectId, characterId, organizationId);
    const version = await this.prisma.characterVersion.findFirst({
      where: { id: versionId, characterId }
    });
    if (!version) throw new NotFoundException('Character version not found');
    return version;
  }

  private async getOwnedCharacterAsset(projectId: string, characterId: string, versionId: string, characterAssetId: string, organizationId: string) {
    await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    const record = await this.prisma.characterAsset.findFirst({ where: { id: characterAssetId, characterVersionId: versionId } });
    if (!record) throw new NotFoundException('Asset do personagem nao encontrado');
    return record;
  }

  private async getVersion(projectId: string, characterId: string, versionId: string, organizationId: string) {
    await this.getOwnedVersion(projectId, characterId, versionId, organizationId);
    const version = await this.prisma.characterVersion.findUnique({
      where: { id: versionId },
      include: { assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } } }
    });
    return this.presentVersion(version!);
  }

  private presentCharacter(link: any) {
    return {
      id: link.character.id,
      name: link.character.name,
      description: link.character.description,
      scope: link.character.scope,
      roleName: link.roleName,
      approvedVersionId: link.character.approvedVersionId,
      selectedVersionId: link.selectedVersionId,
      versions: link.character.versions.map((version: any) => this.presentVersion(version))
    };
  }

  private presentVersion(version: any) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      origin: version.origin,
      status: version.status,
      description: version.description,
      generationPrompt: version.generationPrompt,
      seed: version.seed,
      bullJobId: version.bullJobId,
      errorMessage: version.errorMessage,
      invariants: Array.isArray(version.invariants) ? version.invariants : [],
      generationMetadata: version.generationMetadata,
      generationStartedAt: version.generationStartedAt,
      generationCompletedAt: version.generationCompletedAt,
      assets: (version.assets ?? []).map((item: any) => ({
        id: item.id,
        assetId: item.asset?.id ?? null,
        role: item.role,
        origin: item.origin,
        status: item.status,
        label: item.label,
        mimeType: item.asset?.mimeType ?? null,
        width: item.asset?.width ?? null,
        height: item.asset?.height ?? null,
        errorMessage: item.errorMessage,
        bullJobId: item.bullJobId,
        generationMetadata: item.generationMetadata,
        createdAt: item.createdAt
      }))
    };
  }

  private assertAssetLabel(role: string, label: string) {
    if (role === 'mouth_shape' && !['a', 'e', 'o', 'u', 'closed', 'rest'].includes(label.toLowerCase())) {
      throw new BadRequestException('Formas de boca precisam do rotulo A, E, O, U, closed ou rest');
    }
  }

  private buildGenerationPrompt(name: string, description: string, invariants: string[], visualStyle: string) {
    return [
      `Original children's animation character named ${name}.`,
      description,
      `Visual style: ${visualStyle}.`,
      invariants.length ? `Never change: ${invariants.join('; ')}.` : '',
      'Professional 2D character turnaround sheet, same single character shown in front view, side view and back view, plus a row of clear facial expressions.',
      'Full body, clean readable silhouette, consistent proportions, production-ready model sheet, plain light background, no scenery.',
      'No text, no labels, no logo, no watermark, no duplicate limbs, no extra characters.'
    ].filter(Boolean).join(' ');
  }
}
