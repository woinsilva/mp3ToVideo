import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ChildrenClipStyleLockStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

import { PrismaService } from '../../../database/prisma.service';
import { LocalStorageService } from './local-storage.service';

interface ImageEvidence {
  assetId: string;
  characterVersionId: string;
  role: string;
  width: number | null;
  height: number | null;
  dominantColors: string[];
  averageSaturation: number;
  contrast: number;
  edgeDensity: number;
  directive: string | null;
}

@Injectable()
export class ChildrenClipStyleProfileService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService
  ) {}

  async get(projectId: string) {
    return this.prisma.childrenClipStyleProfile.findUnique({ where: { projectId } });
  }

  async lock(projectId: string, force = false) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        childrenClip: true,
        childrenClipPlan: true,
        childrenClipStyleProfile: true,
        characterLinks: {
          orderBy: { sortOrder: 'asc' },
          include: {
            character: true,
            selectedVersion: {
              include: {
                assets: {
                  where: { status: 'approved', assetId: { not: null } },
                  include: { asset: true },
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        }
      }
    });
    if (!project?.childrenClip || !project.childrenClipPlan) throw new NotFoundException('Projeto de clipe infantil ou Biblia Visual nao encontrado');
    if (!project.characterLinks.length || project.characterLinks.some((link) => link.selectedVersion?.status !== 'approved')) {
      throw new BadRequestException('Aprove uma versao de cada personagem antes de bloquear o estilo');
    }
    const references = project.characterLinks.flatMap((link) => {
      const version = link.selectedVersion!;
      return version.assets.filter((item) => item.asset).map((item) => ({
        characterName: link.character.name,
        characterVersionId: version.id,
        versionDescription: version.description,
        role: item.role,
        generationPrompt: item.generationPrompt,
        asset: item.asset!
      }));
    });
    if (!references.length) throw new BadRequestException('O Style Lock exige ao menos um asset de personagem aprovado');
    await this.ensureShotComposition(projectId);

    const fingerprint = createHash('sha256').update(JSON.stringify(references.map((item) => ({
      assetId: item.asset.id,
      updatedAt: item.asset.updatedAt.toISOString(),
      sizeBytes: item.asset.sizeBytes,
      characterVersionId: item.characterVersionId
    })))).digest('hex');
    const current = project.childrenClipStyleProfile;
    if (current?.status === 'locked' && current.sourceFingerprint === fingerprint && !force) return current;
    if (current?.status === 'locked' && !force) {
      return this.prisma.childrenClipStyleProfile.update({
        where: { projectId },
        data: { status: 'stale', staleAt: new Date(), staleReason: 'Os assets aprovados dos personagens mudaram. Revise e atualize o Style Lock explicitamente.' }
      });
    }

    const evidence = await Promise.all(references.map(async (reference): Promise<ImageEvidence> => ({
      assetId: reference.asset.id,
      characterVersionId: reference.characterVersionId,
      role: reference.role,
      width: reference.asset.width,
      height: reference.asset.height,
      ...(await this.analyzeImage(this.storage.getAbsolutePath(reference.asset.storagePath))),
      directive: this.clean(reference.generationPrompt) || this.metadataPrompt(reference.asset.metadata) || this.clean(reference.versionDescription) || null
    })));
    const profile = this.buildProfile(project.childrenClip.visualStyle, project.childrenClipPlan.visualBible, evidence);
    const negativeConstraints = this.buildNegativeConstraints(project.childrenClipPlan.visualBible, profile);
    const data = {
      status: ChildrenClipStyleLockStatus.locked,
      profile: profile as Prisma.InputJsonValue,
      negativeConstraints: negativeConstraints as Prisma.InputJsonValue,
      styleReferenceAssetIds: evidence.map((item) => item.assetId) as Prisma.InputJsonValue,
      sourceCharacterVersionIds: [...new Set(evidence.map((item) => item.characterVersionId))] as Prisma.InputJsonValue,
      sourceFingerprint: fingerprint,
      lockedAt: new Date(), staleAt: null, staleReason: null
    };
    return this.prisma.childrenClipStyleProfile.upsert({
      where: { projectId },
      create: { projectId, versionNumber: 1, ...data },
      update: { ...data, versionNumber: { increment: 1 } }
    });
  }

  async markStale(projectId: string, reason: string) {
    await this.prisma.childrenClipStyleProfile.updateMany({
      where: { projectId, status: 'locked' },
      data: { status: 'stale', staleAt: new Date(), staleReason: reason }
    });
  }

  private buildProfile(visualStyle: string, visualBibleValue: unknown, evidence: ImageEvidence[]) {
    const bible = this.record(visualBibleValue);
    const palette = this.rankColors(evidence.flatMap((item) => item.dominantColors));
    const mean = (key: 'averageSaturation' | 'contrast' | 'edgeDensity') => Number((evidence.reduce((sum, item) => sum + item[key], 0) / evidence.length).toFixed(3));
    const detailScore = mean('edgeDensity');
    const detailLevel = detailScore < 0.08 ? 'simple' : detailScore < 0.17 ? 'moderate' : 'detailed';
    const saturation = mean('averageSaturation');
    const contrast = mean('contrast');
    const lineStyle = this.clean(bible.lineStyle) || null;
    const shading = this.clean(bible.shading) || null;
    const texture = this.clean(bible.texture) || null;
    const backgroundStyle = this.clean(bible.backgroundStyle) || null;
    return {
      precedence: ['approved_character_assets', 'visual_bible', 'shot_text', 'model_defaults'],
      medium: this.clean(bible.medium) || this.clean(bible.style) || visualStyle,
      lineStyle,
      shading,
      texture,
      lighting: this.clean(bible.lighting) || null,
      backgroundStyle,
      approvedAssetDirectives: [...new Set(evidence.map((item) => item.directive).filter((item): item is string => Boolean(item)))],
      palette: palette.length ? palette : this.stringArray(bible.palette),
      outline: { description: lineStyle, measuredEdgeDensity: detailScore, consistency: 'locked-to-approved-assets' },
      shadingProfile: { description: shading, maximumComplexity: detailLevel },
      geometry: { detailLevel, silhouetteComplexity: detailLevel, source: 'approved-asset-edge-analysis' },
      colors: { palette: palette.length ? palette : this.stringArray(bible.palette), averageSaturation: saturation, contrast, source: 'approved-asset-pixel-analysis' },
      depth: { description: this.clean(bible.depth) || backgroundStyle, parallaxFriendly: true },
      textureProfile: { description: texture, maximumLevel: detailLevel },
      background: { detailLevel, priority: 'characters-remain-dominant', description: backgroundStyle },
      colorMetrics: { averageSaturation: saturation, contrast },
      characterDetail: { edgeDensity: detailScore, level: detailLevel },
      maxBackgroundDetail: detailLevel,
      evidence: evidence.map(({ directive: _directive, ...item }) => item)
    };
  }

  private buildNegativeConstraints(visualBibleValue: unknown, profile: Record<string, unknown>) {
    const bible = this.record(visualBibleValue);
    const maxDetail = this.clean(profile.maxBackgroundDetail);
    const projectText = Object.values(bible).filter((item): item is string => typeof item === 'string');
    const derived = [...new Set(projectText.flatMap((text) => text.split(/[.\n;]+/))
      .map((item) => item.trim())
      .filter((item) => /\b(n[aã]o|nunca|evitar|sem|avoid|never|no)\b/i.test(item))
      .map((item) => {
        const withoutPrefix = item.replace(/^(n[aã]o\s+(?:usar|incluir)|nunca\s+(?:usar)?|evitar|avoid|never)\s*/i, '').trim();
        const semIndex = withoutPrefix.search(/\bsem\b/i);
        return (semIndex >= 0 ? withoutPrefix.slice(semIndex + 3) : withoutPrefix)
          .replace(/\bnunca\s+(?:deve\s+)?/i, '')
          .replace(/\bn[aã]o\s+/i, '')
          .trim();
      })
      .filter(Boolean))];
    return [
      this.clean(bible.negativeStyle),
      ...derived,
      maxDetail === 'simple' ? 'intricate micro-details, busy textures, excessive background detail' : null,
      maxDetail === 'moderate' ? 'hyper-detailed textures, visual clutter' : null,
      'photorealism, inconsistent medium, 3D render, style drift, mismatched outlines, mismatched shading, mismatched palette'
    ].filter((item): item is string => Boolean(item));
  }

  private async analyzeImage(path: string) {
    try {
      const { data, info } = await sharp(path).removeAlpha().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      const colors = new Map<string, number>();
      let saturation = 0; let luminanceSum = 0; let luminanceSquared = 0; let edges = 0; let comparisons = 0;
      const luminances: number[] = [];
      for (let index = 0; index < data.length; index += info.channels) {
        const r = data[index] / 255; const g = data[index + 1] / 255; const b = data[index + 2] / 255;
        const max = Math.max(r, g, b); const min = Math.min(r, g, b);
        saturation += max === 0 ? 0 : (max - min) / max;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        luminances.push(lum); luminanceSum += lum; luminanceSquared += lum * lum;
        const q = [r, g, b].map((value) => Math.round(value * 5) * 51);
        const color = `#${q.map((value) => Math.min(255, value).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
        colors.set(color, (colors.get(color) ?? 0) + 1);
      }
      for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
        const current = luminances[y * 32 + x];
        if (x < 31) { comparisons += 1; if (Math.abs(current - luminances[y * 32 + x + 1]) > 0.16) edges += 1; }
        if (y < 31) { comparisons += 1; if (Math.abs(current - luminances[(y + 1) * 32 + x]) > 0.16) edges += 1; }
      }
      const pixels = luminances.length; const average = luminanceSum / pixels;
      return {
        dominantColors: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([color]) => color),
        averageSaturation: Number((saturation / pixels).toFixed(3)),
        contrast: Number(Math.sqrt(Math.max(0, luminanceSquared / pixels - average * average)).toFixed(3)),
        edgeDensity: Number((edges / comparisons).toFixed(3))
      };
    } catch {
      return { dominantColors: [], averageSaturation: 0, contrast: 0, edgeDensity: 0 };
    }
  }

  private async ensureShotComposition(projectId: string) {
    const shots = await this.prisma.childrenClipShot.findMany({
      where: { projectId, OR: [{ characterPlacement: { equals: Prisma.DbNull } }, { backgroundSafeZones: { equals: Prisma.DbNull } }, { groundingRules: { equals: Prisma.DbNull } }] },
      select: { id: true, index: true, characterVersionIds: true, framing: true, characterPlacement: true, backgroundSafeZones: true, groundingRules: true }
    });
    for (const shot of shots) {
      const ids = this.stringArray(shot.characterVersionIds);
      const xs = ids.length <= 1 ? [50] : ids.length === 2 ? [35, 65] : ids.map((_, index) => Math.round(20 + (60 * index) / Math.max(1, ids.length - 1)));
      const subjects = ids.map((versionId, index) => ({ versionId, zone: xs[index] < 42 ? 'left' : xs[index] > 58 ? 'right' : 'center', xPercent: xs[index], yPercent: 76, scalePercent: shot.framing.toLowerCase().includes('close') ? 72 : 48, facing: xs[index] <= 50 ? 'right' : 'left' }));
      const zones = subjects.length ? subjects.map((subject, index) => ({ name: `character-${index + 1}`, xPercent: Math.max(0, subject.xPercent - 14), yPercent: 28, widthPercent: 28, heightPercent: 58, purpose: `reserved for approved entity ${subject.versionId}` })) : [{ name: 'action-center', xPercent: 25, yPercent: 30, widthPercent: 50, heightPercent: 55, purpose: 'reserved action area' }];
      await this.prisma.childrenClipShot.update({
        where: { id: shot.id },
        data: {
          characterPlacement: (shot.characterPlacement ?? { strategy: 'safe-zone-layout', subjects, movementDirection: shot.index % 2 === 0 ? 'left-to-right' : 'right-to-left' }) as Prisma.InputJsonValue,
          backgroundSafeZones: (shot.backgroundSafeZones ?? zones) as Prisma.InputJsonValue,
          groundingRules: (shot.groundingRules ?? { groundLinePercent: 78, horizonPercent: 42, perspective: 'gentle eye-level perspective suitable for 2D character compositing', requireContactShadows: true, preserveScaleAcrossLocation: true }) as Prisma.InputJsonValue
        }
      });
    }
  }

  private rankColors(colors: string[]) { return [...new Map(colors.map((color) => [color, (colors.filter((item) => item === color).length)])).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([color]) => color); }
  private metadataPrompt(value: unknown) { const metadata = this.record(value); return this.clean(metadata.prompt) || this.clean(metadata.positivePrompt); }
  private record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
  private clean(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
}
