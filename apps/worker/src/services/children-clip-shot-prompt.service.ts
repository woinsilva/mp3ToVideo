import { Injectable } from '@nestjs/common';

export interface ShotPromptEntity {
  versionId: string;
  name: string;
  type: string;
  identity: string;
  referenceAsset?: { id: string; storagePath: string } | null;
}

export interface ShotPromptContext {
  role: 'background' | 'foreground' | 'prop' | 'storyboard_frame' | 'character_pose';
  customPrompt?: string | null;
  shot: {
    index: number;
    description: string;
    purpose: string;
    primaryFocus: string | null;
    environment: string;
    backgroundPrompt: string;
    framing: string;
    cameraMovement: string;
    characterAction: string;
    timeOfDay: string | null;
    continuityFromPreviousShot: string | null;
    characterVersionIds: unknown;
    forbiddenEntityVersionIds: unknown;
    objects: unknown;
  };
  visualBible: unknown;
  narrative: unknown;
  entities: ShotPromptEntity[];
}

export interface BuiltShotImagePrompt {
  positivePrompt: string;
  negativePrompt: string;
  referenceAssets: Array<{ id: string; storagePath: string; versionId: string }>;
  allowedEntityVersionIds: string[];
  forbiddenEntityVersionIds: string[];
}

@Injectable()
export class ChildrenClipShotPromptService {
  build(context: ShotPromptContext): BuiltShotImagePrompt {
    const allowedIds = this.unique(this.stringArray(context.shot.characterVersionIds));
    const forbiddenIds = this.unique(this.stringArray(context.shot.forbiddenEntityVersionIds));
    const knownIds = new Set(context.entities.map((item) => item.versionId));
    const conflicts = allowedIds.filter((id) => forbiddenIds.includes(id));
    if (conflicts.length) throw new Error('Shot Plan possui conflito entre entidades permitidas e proibidas');
    if ([...allowedIds, ...forbiddenIds].some((id) => !knownIds.has(id))) throw new Error('Shot Plan referencia entidade desconhecida');

    const allowed = context.entities.filter((item) => allowedIds.includes(item.versionId));
    const forbidden = context.entities.filter((item) => forbiddenIds.includes(item.versionId));
    const customPrompt = context.customPrompt?.trim() || null;
    const style = this.environmentArtDirection(context.visualBible);
    const globalSummary = this.globalSummary(context.narrative);
    const basePrompt = customPrompt || (context.role === 'background' ? context.shot.backgroundPrompt : context.shot.description);
    if (!basePrompt?.trim()) throw new Error('A tomada nao possui uma descricao visual especifica');
    if (globalSummary && this.normalize(basePrompt) === this.normalize(globalSummary)) throw new Error('A descricao da tomada nao pode repetir a narrativa global');

    if (context.role === 'background') {
      const namedEntity = context.entities.find((entity) => this.containsName(basePrompt, entity.name));
      if (namedEntity) throw new Error(`Background-only nao pode solicitar a entidade ${namedEntity.name}`);
      return {
        positivePrompt: [
          'original polished 2D children animation background plate, clean layered environment, clear foreground middle ground and background',
          style,
          basePrompt,
          context.shot.timeOfDay,
          context.shot.continuityFromPreviousShot,
          `environmental composition only: ${context.shot.framing}; ${context.shot.cameraMovement}`,
          'empty staging area for later 2D composition; no registered entities; no characters; no vehicles; no text'
        ].filter(Boolean).join(', '),
        negativePrompt: [
          'person, people, child, human, character, animal, creature, mascot, vehicle, duplicate subject',
          ...context.entities.map((item) => item.name),
          'photorealistic, 3d render, text, letters, logo, watermark, signature, scary, violence, weapon, malformed, low quality'
        ].join(', '),
        referenceAssets: [],
        allowedEntityVersionIds: allowedIds,
        forbiddenEntityVersionIds: forbiddenIds
      };
    }

    const focusName = this.normalize(context.shot.primaryFocus);
    const orderedAllowed = [...allowed].sort((a, b) => {
      const aFocus = this.normalize(a.name) === focusName ? 0 : 1;
      const bFocus = this.normalize(b.name) === focusName ? 0 : 1;
      return aFocus - bFocus;
    });
    const references = orderedAllowed.filter((item) => item.referenceAsset).map((item) => ({
      id: item.referenceAsset!.id,
      storagePath: item.referenceAsset!.storagePath,
      versionId: item.versionId
    }));
    const identityText = orderedAllowed.map((item) => `${item.name} (${item.type}): ${this.limit(item.identity, 450)}`);
    return {
      positivePrompt: [
        'original polished 2D children animation, clean bold outlines, simple cel shading',
        style,
        context.role === 'storyboard_frame' ? 'complete shot composition' : `isolated ${context.role} visual asset`,
        basePrompt,
        context.shot.characterAction,
        `allowed entities only: ${orderedAllowed.map((item) => item.name).join(', ') || 'none'}`,
        ...identityText,
        context.shot.continuityFromPreviousShot,
        `composition: ${context.shot.framing}; camera: ${context.shot.cameraMovement}`
      ].filter(Boolean).join(', '),
      negativePrompt: [
        forbidden.length ? `forbidden entities: ${forbidden.map((item) => item.name).join(', ')}` : null,
        'extra person, extra character, duplicate entity, cloned subject, mirrored duplicate, crowd, photorealistic, 3d render, text, logo, watermark, scary, violence, malformed, low quality'
      ].filter(Boolean).join(', '),
      referenceAssets: references,
      allowedEntityVersionIds: allowedIds,
      forbiddenEntityVersionIds: forbiddenIds
    };
  }

  private environmentArtDirection(value: unknown) {
    const bible = this.record(value);
    return [bible.style, bible.palette ? `palette: ${JSON.stringify(bible.palette)}` : null, bible.lineStyle, bible.lighting, bible.backgroundStyle]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => this.limit(item, 500)).join(', ');
  }

  private globalSummary(value: unknown) {
    const narrative = this.record(value);
    return typeof narrative.summary === 'string' ? narrative.summary : typeof narrative.logline === 'string' ? narrative.logline : '';
  }

  private record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
  private unique(values: string[]) { return [...new Set(values)]; }
  private normalize(value: unknown) { return typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : ''; }
  private containsName(text: string, name: string) { const target = this.normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return target.length > 1 && new RegExp(`(^|[^a-z0-9])${target}($|[^a-z0-9])`).test(this.normalize(text)); }
  private limit(value: string, length: number) { return value.length > length ? `${value.slice(0, length - 3)}...` : value; }
}
