import { Injectable } from '@nestjs/common';

export interface ShotPromptEntity {
  versionId: string;
  name: string;
  type: string;
  identity: string;
  referenceAsset?: { id: string; storagePath: string; width?: number | null; height?: number | null; generatedTurnaround?: boolean } | null;
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
    characterPlacement?: unknown;
    backgroundSafeZones?: unknown;
    groundingRules?: unknown;
    location?: { masterBackgroundAsset?: { id: string; storagePath: string } | null } | null;
  };
  visualBible: unknown;
  styleProfile?: { status: string; versionNumber: number; profile: unknown; negativeConstraints: unknown; styleReferenceAssetIds: unknown } | null;
  narrative: unknown;
  entities: ShotPromptEntity[];
}

export interface BuiltShotImagePrompt {
  positivePrompt: string;
  negativePrompt: string;
  referenceAssets: Array<{ id: string; storagePath: string; purpose: 'entity-content' | 'location-content'; versionId?: string; width?: number | null; height?: number | null; generatedTurnaround?: boolean }>;
  styleReferenceAssetIds: string[];
  styleProfileVersion: number | null;
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
    const lockedStyle = this.lockedStyle(context.styleProfile);
    const globalSummary = this.globalSummary(context.narrative);
    const basePrompt = customPrompt || (context.role === 'background' ? context.shot.backgroundPrompt : context.shot.description);
    if (!basePrompt?.trim()) throw new Error('A tomada nao possui uma descricao visual especifica');
    if (globalSummary && this.normalize(basePrompt) === this.normalize(globalSummary)) throw new Error('A descricao da tomada nao pode repetir a narrativa global');

    if (context.role === 'background') {
      if (!context.styleProfile || context.styleProfile.status !== 'locked') throw new Error('Background requer um Project Style Lock ativo');
      const namedEntity = context.entities.find((entity) => this.containsName(basePrompt, entity.name));
      if (namedEntity) throw new Error(`Background-only nao pode solicitar a entidade ${namedEntity.name}`);
      const safeStyle = this.withoutSubjectFragments(this.withoutNamedFragments(style, context.entities.map((entity) => entity.name)));
      const safeLockedStyle = this.withoutSubjectFragments(this.withoutNamedFragments(lockedStyle.positive, context.entities.map((entity) => entity.name)));
      const safeEnvironment = this.withoutSubjectFragments(this.withoutNamedFragments(context.shot.environment, context.entities.map((entity) => entity.name)));
      const positivePrompt = this.withoutNamedFragments([
        'original polished flat vector 2D cel animation environment background plate, bold clean outlines, simple rounded shapes, no volumetric rendering, unoccupied establishing shot',
        safeEnvironment ? `(required depicted location with all named architecture and landmarks clearly visible: ${safeEnvironment}:1.55)` : null,
        'the requested place is the main visual subject; do not replace it with a generic park, road, courtyard or room',
        this.limit(safeLockedStyle, 420),
        this.limit(safeStyle, 320),
        context.shot.timeOfDay,
        context.shot.continuityFromPreviousShot,
        `environmental composition only: ${context.shot.framing}; ${context.shot.cameraMovement}`,
        this.compositionRules(context.shot),
        'completely empty staging area for later 2D composition; architecture and landscape only; zero people; zero children; zero characters; zero animals; zero mascots; zero vehicles; no faces; no eyes; no text'
      ].filter(Boolean).join(', '), context.entities.map((entity) => entity.name));
      const leakedEntity = context.entities.find((entity) => this.containsName(positivePrompt, entity.name));
      if (leakedEntity) throw new Error(`Background-only positivo inclui a entidade ${leakedEntity.name}`);
      return {
        positivePrompt,
        negativePrompt: [
          '(person:2.0), (people:2.0), (child:2.0), (boy:2.0), (girl:2.0), (human:2.0), (face:2.0), (eyes:2.0), (character:2.0), (animal:2.0), (creature:2.0), (mascot:2.0), (vehicle:2.0), portrait, body, silhouette, duplicate subject',
          ...context.entities.map((item) => item.name),
          ...lockedStyle.negative,
          'photorealistic, 3d render, text, letters, logo, watermark, signature, scary, violence, weapon, malformed, low quality'
        ].join(', '),
        referenceAssets: context.shot.location?.masterBackgroundAsset ? [{
          id: context.shot.location.masterBackgroundAsset.id,
          storagePath: context.shot.location.masterBackgroundAsset.storagePath,
          purpose: 'location-content' as const
        }] : [],
        styleReferenceAssetIds: this.stringArray(context.styleProfile.styleReferenceAssetIds),
        styleProfileVersion: context.styleProfile.versionNumber,
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
      width: item.referenceAsset!.width,
      height: item.referenceAsset!.height,
      generatedTurnaround: item.referenceAsset!.generatedTurnaround,
      versionId: item.versionId,
      purpose: 'entity-content' as const
    }));
    const identityText = orderedAllowed.map((item) => `${item.name} (${item.type}): ${this.limit(item.identity, 450)}`);
    return {
      positivePrompt: [
        'original polished 2D children animation, clean bold outlines, simple cel shading',
        lockedStyle.positive,
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
      styleReferenceAssetIds: context.styleProfile ? this.stringArray(context.styleProfile.styleReferenceAssetIds) : [],
      styleProfileVersion: context.styleProfile?.versionNumber ?? null,
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

  private lockedStyle(value: ShotPromptContext['styleProfile']) {
    if (!value || value.status !== 'locked') return { positive: '', negative: [] as string[] };
    const profile = this.record(value.profile);
    const metrics = this.record(profile.colorMetrics);
    const detail = this.record(profile.characterDetail);
    return {
      positive: [
        profile.medium,
        profile.lineStyle,
        profile.shading,
        profile.texture,
        profile.lighting,
        profile.backgroundStyle,
        Array.isArray(profile.palette) ? `approved project palette: ${profile.palette.join(', ')}` : null,
        typeof metrics.averageSaturation === 'number' ? `match approved saturation ${metrics.averageSaturation} and contrast ${metrics.contrast}` : null,
        profile.maxBackgroundDetail ? `background detail must not exceed approved character detail: ${profile.maxBackgroundDetail}; character edge density ${detail.edgeDensity ?? 'measured'}` : null,
        `project style lock version ${value.versionNumber}; keep medium, outlines, shading, texture and color language identical across the series`
      ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(', '),
      negative: this.stringArray(value.negativeConstraints)
    };
  }

  private compositionRules(shot: ShotPromptContext['shot']) {
    const zones = Array.isArray(shot.backgroundSafeZones) ? shot.backgroundSafeZones.filter((item): item is Record<string, unknown> => this.record(item) === item) : [];
    const grounding = this.record(shot.groundingRules);
    const zoneText = zones.map((zone) => `${String(zone.name ?? 'safe zone')} x=${zone.xPercent}% y=${zone.yPercent}% w=${zone.widthPercent}% h=${zone.heightPercent}%`).join('; ');
    return [
      zoneText ? `preserve uncluttered background safe zones: ${zoneText}` : null,
      grounding.groundLinePercent !== undefined ? `clear ground plane at ${grounding.groundLinePercent}% image height and horizon at ${grounding.horizonPercent}%` : null,
      grounding.perspective ? `grounding and perspective: ${grounding.perspective}` : null,
      'consistent architecture scale, usable contact area, no important object crossing reserved character zones, native widescreen composition'
    ].filter(Boolean).join(', ');
  }

  private record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
  private unique(values: string[]) { return [...new Set(values)]; }
  private normalize(value: unknown) { return typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : ''; }
  private containsName(text: string, name: string) { const target = this.normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return target.length > 1 && new RegExp(`(^|[^a-z0-9])${target}($|[^a-z0-9])`).test(this.normalize(text)); }
  private withoutNamedFragments(value: string, names: string[]) {
    return value.split(/(?<=[.!?;])\s+|,\s+/)
      .filter((fragment) => fragment.trim() && !names.some((name) => this.containsName(fragment, name)))
      .join(', ');
  }
  private withoutSubjectFragments(value: string) {
    const subjectTerms = /\b(person|people|child|children|boy|girl|human|character|characters|animal|animals|creature|mascot|vehicle|vehicles|face|faces|eye|eyes|expression|expressions|pessoa|pessoas|crianca|criancas|menino|menina|humano|personagem|personagens|animal|animais|criatura|mascote|mascotes|veiculo|veiculos|rosto|rostos|olho|olhos|expressao|expressoes)\b/i;
    return value.split(/(?<=[.!?;])\s+|,\s+/)
      .filter((fragment) => fragment.trim() && !subjectTerms.test(this.normalize(fragment)))
      .join(', ');
  }
  private limit(value: string, length: number) { return value.length > length ? `${value.slice(0, length - 3)}...` : value; }
}
