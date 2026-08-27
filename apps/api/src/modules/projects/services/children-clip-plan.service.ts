import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ChildrenClipPlanStatus, Prisma, ProcessingJobStatus } from '@prisma/client';
import { CHILDREN_CLIP_PLAN_GENERATE_JOB_NAME, CHILDREN_CLIP_QUEUE_NAME } from '@video/shared';

import { PrismaService } from '../../../database/prisma.service';
import { ChildrenClipQueueService } from '../../jobs/services/children-clip-queue.service';
import type { GenerateChildrenClipPlanDto } from '../dtos/generate-children-clip-plan.dto';
import type { UpdateChildrenClipPlanDto } from '../dtos/update-children-clip-plan.dto';
import type { UpdateChildrenClipShotDto } from '../dtos/update-children-clip-shot.dto';
import { ChildrenClipStyleProfileService } from './children-clip-style-profile.service';

@Injectable()
export class ChildrenClipPlanService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChildrenClipQueueService) private readonly queue: ChildrenClipQueueService,
    @Inject(ChildrenClipStyleProfileService) private readonly styles: ChildrenClipStyleProfileService
  ) {}

  async get(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    const processingJob = await this.prisma.processingJob.findFirst({
      where: { projectId, jobName: CHILDREN_CLIP_PLAN_GENERATE_JOB_NAME },
      orderBy: { createdAt: 'desc' }
    });
    const blockers = this.readinessBlockers(project);
    return {
      plan: project.childrenClipPlan,
      shots: project.childrenClipShots,
      readyToGenerate: blockers.length === 0,
      blockers,
      job: processingJob ? {
        status: processingJob.status,
        progress: processingJob.progress,
        detailMessage: processingJob.detailMessage,
        errorMessage: processingJob.errorMessage,
        activityLog: processingJob.activityLog
      } : null
    };
  }

  async enqueue(
    projectId: string,
    organizationId: string,
    requestedByUserId: string,
    input: GenerateChildrenClipPlanDto
  ) {
    return this.enqueueMode(projectId, organizationId, requestedByUserId, input, 'full');
  }

  async replanShots(
    projectId: string,
    organizationId: string,
    requestedByUserId: string,
    input: GenerateChildrenClipPlanDto
  ) {
    const project = await this.getOwnedProject(projectId, organizationId);
    if (!project.childrenClipPlan || !project.childrenClipShots.length) {
      throw new BadRequestException('Gere o plano inicial antes de replanejar as tomadas');
    }
    return this.enqueueMode(projectId, organizationId, requestedByUserId, input, 'shots_only', project);
  }

  private async enqueueMode(
    projectId: string,
    organizationId: string,
    requestedByUserId: string,
    input: GenerateChildrenClipPlanDto,
    mode: 'full' | 'shots_only',
    loadedProject?: Awaited<ReturnType<ChildrenClipPlanService['getOwnedProject']>>
  ) {
    const project = loadedProject ?? await this.getOwnedProject(projectId, organizationId);
    const blockers = this.readinessBlockers(project);
    if (blockers.length) throw new BadRequestException(blockers.join(' '));
    if (project.childrenClipPlan?.status === 'queued' || project.childrenClipPlan?.status === 'generating') {
      throw new BadRequestException('O planejamento ja esta em andamento');
    }
    const revisionInstruction = input.revisionInstruction?.trim() || null;
    const queued = await this.queue.enqueueProductionPlan({
      projectId, organizationId, requestedByUserId, revisionInstruction, mode
    });
    await this.prisma.$transaction([
      this.prisma.childrenClipPlan.upsert({
        where: { projectId },
        create: {
          projectId, status: ChildrenClipPlanStatus.queued, bullJobId: queued.bullJobId,
          revisionInstruction
        },
        update: {
          status: ChildrenClipPlanStatus.queued, bullJobId: queued.bullJobId,
          revisionInstruction, errorMessage: null, approvedAt: null,
          generationStartedAt: null, generationEndedAt: null
        }
      }),
      this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'planning_narrative' } }),
      this.prisma.processingJob.create({
        data: {
          projectId, queueName: CHILDREN_CLIP_QUEUE_NAME, jobName: CHILDREN_CLIP_PLAN_GENERATE_JOB_NAME,
          bullJobId: queued.bullJobId, status: ProcessingJobStatus.queued, progress: 0,
          detailMessage: mode === 'shots_only' ? 'Replanejamento semantico das tomadas enfileirado.' : 'Planejamento narrativo enfileirado.',
          activityLog: [{ stage: 'QUEUED', message: mode === 'shots_only' ? 'Replanejamento semantico das tomadas enfileirado.' : 'Planejamento narrativo enfileirado.', progress: 0, timestamp: new Date().toISOString() }]
        }
      })
    ]);
    await this.styles.lock(projectId);
    return this.get(projectId, organizationId);
  }

  async updatePlan(projectId: string, organizationId: string, input: UpdateChildrenClipPlanDto) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertEditable(project.childrenClipPlan?.status);
    if (!project.childrenClipPlan) throw new NotFoundException('Plano de producao ainda nao foi criado');
    await this.prisma.childrenClipPlan.update({
      where: { projectId },
      data: {
        ...(input.visualBible ? { visualBible: input.visualBible as Prisma.InputJsonValue } : {}),
        ...(input.narrative ? { narrative: input.narrative as Prisma.InputJsonValue } : {})
      }
    });
    return this.get(projectId, organizationId);
  }

  async updateShot(
    projectId: string,
    shotId: string,
    organizationId: string,
    input: UpdateChildrenClipShotDto
  ) {
    const project = await this.getOwnedProject(projectId, organizationId);
    this.assertEditable(project.childrenClipPlan?.status);
    const shot = project.childrenClipShots.find((item) => item.id === shotId);
    if (!shot) throw new NotFoundException('Tomada nao encontrada');
    const startSeconds = input.startSeconds ?? shot.startSeconds;
    const endSeconds = input.endSeconds ?? shot.endSeconds;
    if (endSeconds <= startSeconds) throw new BadRequestException('O fim da tomada deve ser posterior ao inicio');
    if (endSeconds > (project.childrenClipAudioAnalysis?.durationSeconds ?? 0) + 0.01) {
      throw new BadRequestException('A tomada ultrapassa a duracao da musica');
    }
    const previous = project.childrenClipShots.find((item) => item.index === shot.index - 1);
    const next = project.childrenClipShots.find((item) => item.index === shot.index + 1);
    if (previous && startSeconds < previous.endSeconds - 0.01) throw new BadRequestException('A tomada sobrepoe a anterior');
    if (next && endSeconds > next.startSeconds + 0.01) throw new BadRequestException('A tomada sobrepoe a seguinte');

    await this.prisma.childrenClipShot.update({
      where: { id: shotId },
      data: {
        ...input,
        title: input.title?.trim(),
        description: input.description?.trim(),
        framing: input.framing?.trim(),
        cameraMovement: input.cameraMovement?.trim(),
        characterAction: input.characterAction?.trim(),
        environment: input.environment?.trim(),
        backgroundPrompt: input.backgroundPrompt?.trim(),
        transitionIn: input.transitionIn?.trim(),
        transitionOut: input.transitionOut?.trim(),
        motionPreset: input.motionPreset?.trim(),
        revisionInstruction: input.revisionInstruction?.trim(),
        startSeconds,
        endSeconds,
        durationSeconds: Number((endSeconds - startSeconds).toFixed(3)),
        status: 'needs_revision'
      }
    });
    return this.get(projectId, organizationId);
  }

  async approve(projectId: string, organizationId: string) {
    const project = await this.getOwnedProject(projectId, organizationId);
    if (project.childrenClipPlan?.status !== 'ready_for_review') {
      throw new BadRequestException('O plano precisa estar pronto para revisao');
    }
    if (!project.childrenClipShots.length) throw new BadRequestException('O storyboard nao possui tomadas');
    this.validateSemanticShots(project);
    const selectedVersionIds = new Set(project.characterLinks.map((link) => link.selectedVersionId).filter(Boolean));
    const hasStaleIdentity = project.childrenClipShots.some((shot) =>
      Array.isArray(shot.characterVersionIds) &&
      shot.characterVersionIds.some((versionId) => typeof versionId === 'string' && !selectedVersionIds.has(versionId))
    );
    if (hasStaleIdentity) {
      throw new BadRequestException('Regere as tomadas marcadas: o plano ainda referencia uma versao antiga de personagem');
    }
    const duration = project.childrenClipAudioAnalysis?.durationSeconds ?? 0;
    const shots = project.childrenClipShots;
    if (Math.abs(shots[0].startSeconds) > 0.05 || Math.abs(shots[shots.length - 1].endSeconds - duration) > 0.05) {
      throw new BadRequestException('A timeline precisa cobrir toda a musica');
    }
    for (let index = 1; index < shots.length; index += 1) {
      if (Math.abs(shots[index].startSeconds - shots[index - 1].endSeconds) > 0.05) {
        throw new BadRequestException(`Existe uma lacuna entre as tomadas ${index} e ${index + 1}`);
      }
    }
    await this.prisma.$transaction([
      this.prisma.childrenClipPlan.update({ where: { projectId }, data: { status: 'approved', approvedAt: new Date() } }),
      this.prisma.childrenClipShot.updateMany({ where: { projectId }, data: { status: 'approved' } }),
      this.prisma.childrenClip.update({ where: { projectId }, data: { productionStatus: 'storyboarding' } })
    ]);
    return this.get(projectId, organizationId);
  }

  private readinessBlockers(project: Awaited<ReturnType<ChildrenClipPlanService['getOwnedProject']>>) {
    const blockers: string[] = [];
    if (project.childrenClipAudioAnalysis?.status !== 'completed') blockers.push('Conclua a analise da musica.');
    if (!project.musicSections.length) blockers.push('A analise precisa identificar ao menos uma secao musical.');
    if (!project.characterLinks.length) blockers.push('Adicione pelo menos um personagem.');
    if (project.characterLinks.some((link) => !link.selectedVersion || link.selectedVersion.status !== 'approved')) {
      blockers.push('Aprove uma versao de cada personagem.');
    }
    return blockers;
  }

  private assertEditable(status: string | undefined) {
    if (status === 'approved') throw new BadRequestException('Crie uma nova revisao para alterar um plano aprovado');
    if (status === 'queued' || status === 'generating') throw new BadRequestException('Aguarde a geracao do plano terminar');
  }

  private validateSemanticShots(project: Awaited<ReturnType<ChildrenClipPlanService['getOwnedProject']>>) {
    const selected = project.characterLinks
      .filter((link) => link.selectedVersionId)
      .map((link) => ({ id: link.selectedVersionId!, name: link.character.name }));
    const knownIds = new Set(selected.map((item) => item.id));
    const narrative = project.childrenClipPlan?.narrative;
    const global = narrative && typeof narrative === 'object' && !Array.isArray(narrative) ? narrative as Record<string, unknown> : {};
    const summaries = [global.summary, global.logline].filter((item): item is string => typeof item === 'string').map((item) => this.normalize(item));
    for (const shot of project.childrenClipShots) {
      if (!shot.purpose.trim() || !shot.locationId) throw new BadRequestException(`Replaneje a tomada ${shot.index + 1}: faltam dados semanticos ou localizacao.`);
      const allowed = this.stringArray(shot.characterVersionIds);
      const forbidden = this.stringArray(shot.forbiddenEntityVersionIds);
      if (new Set(allowed).size !== allowed.length || new Set(forbidden).size !== forbidden.length) throw new BadRequestException(`Tomada ${shot.index + 1}: existem entidades duplicadas.`);
      if (allowed.some((id) => forbidden.includes(id))) throw new BadRequestException(`Tomada ${shot.index + 1}: uma entidade esta permitida e proibida ao mesmo tempo.`);
      if ([...allowed, ...forbidden].some((id) => !knownIds.has(id))) throw new BadRequestException(`Tomada ${shot.index + 1}: existe uma entidade desconhecida.`);
      if (summaries.includes(this.normalize(shot.description))) throw new BadRequestException(`Tomada ${shot.index + 1}: a descricao repete a narrativa global.`);
      const entity = selected.find((item) => this.containsName(shot.backgroundPrompt, item.name));
      if (entity) throw new BadRequestException(`Tomada ${shot.index + 1}: o fundo inclui a entidade ${entity.name}.`);

      const positiveDescription = this.normalize(shot.description).split(/\bnao aparecem\s*:/, 1)[0];
      const positiveSemantics = [
        positiveDescription,
        this.normalize(shot.purpose),
        this.normalize(shot.framing),
        this.normalize(shot.cameraMovement),
        this.normalize(shot.characterAction),
        this.normalize(shot.motionIntent),
        this.normalize(shot.continuityFromPreviousShot),
        this.normalize(JSON.stringify(shot.characterPlacement))
      ].filter(Boolean).join(' ');
      for (const candidate of selected) {
        if (this.containsName(shot.primaryFocus ?? '', candidate.name) && !allowed.includes(candidate.id)) {
          throw new BadRequestException(`Tomada ${shot.index + 1}: o foco ${candidate.name} nao esta nas entidades permitidas.`);
        }
        if (this.containsName(positiveSemantics, candidate.name) && !allowed.includes(candidate.id)) {
          throw new BadRequestException(`Tomada ${shot.index + 1}: ${candidate.name} aparece na descricao da acao, mas nao esta nas entidades permitidas.`);
        }
      }
    }
  }

  private stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
  private normalize(value: unknown) { return typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : ''; }
  private containsName(text: string, name: string) { const target = this.normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return target.length > 1 && new RegExp(`(^|[^a-z0-9])${target}($|[^a-z0-9])`).test(this.normalize(text)); }

  private async getOwnedProject(projectId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, generationMode: 'children_clip', deletedAt: null },
      include: {
        childrenClip: true,
        childrenClipAudioAnalysis: true,
        childrenClipPlan: true,
        childrenClipShots: { orderBy: { index: 'asc' }, include: { location: true } },
        childrenClipLocations: { orderBy: { key: 'asc' } },
        musicSections: true,
        characterLinks: { include: { character: true, selectedVersion: true } }
      }
    });
    if (!project?.childrenClip) throw new NotFoundException('Children clip project not found');
    return project;
  }
}
