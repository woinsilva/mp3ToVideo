import { Injectable } from '@nestjs/common';

interface PlanningSection { id: string; title: string; type: string; startSeconds: number; endSeconds: number; lyricsExcerpt: string | null; energy: number | null; }
interface PlanningCue { text: string; startSeconds: number; endSeconds: number; }
export interface PlanningCharacter { name: string; roleName: string | null; versionId: string; description: string; }

export interface CreativeShotPlan {
  shotIndex?: number; purpose?: string; locationKey?: string; locationName?: string;
  locationDescription?: string; timeOfDay?: string; primaryFocus?: string;
  characters?: string[]; allowedEntities?: string[]; forbiddenEntities?: string[];
  objects?: string[]; action?: string; composition?: string; camera?: string;
  emotion?: string; motionIntent?: string; continuityFromPreviousShot?: string | null;
  characterPlacement?: Array<{ entity?: string; zone?: string; xPercent?: number; yPercent?: number; scalePercent?: number; facing?: string }>;
  backgroundSafeZones?: Array<{ name?: string; xPercent?: number; yPercent?: number; widthPercent?: number; heightPercent?: number; purpose?: string }>;
  grounding?: { groundLinePercent?: number; horizonPercent?: number; perspective?: string; movementDirection?: string };
  semanticAuditPassed?: boolean;
}

export interface CreativePlanResponse {
  visualBible?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  locations?: Array<{ key?: string; name?: string; description?: string; timeOfDay?: string; visualPrompt?: string; continuityRules?: string[] }>;
  shotPlans?: CreativeShotPlan[];
  sectionPlans?: Array<{ sectionTitle?: string; environment?: string; action?: string; mood?: string }>;
}

export interface PlannedChildrenClipLocation {
  key: string; name: string; description: string; timeOfDay: string | null;
  visualPrompt: string; continuityRules: string[];
}

export interface PlannedChildrenClipShot {
  musicSectionId: string; locationKey: string; index: number; title: string; description: string;
  purpose: string; primaryFocus: string | null; timeOfDay: string | null; emotion: string | null;
  motionIntent: string | null; continuityFromPreviousShot: string | null; startSeconds: number;
  endSeconds: number; durationSeconds: number; framing: string; cameraMovement: string;
  characterAction: string; environment: string; backgroundPrompt: string; transitionIn: string | null;
  transitionOut: string | null; lyricText: string | null; characterVersionIds: string[];
  forbiddenEntityVersionIds: string[]; objects: string[]; layers: Array<Record<string, unknown>>;
  characterPlacement: Record<string, unknown>; backgroundSafeZones: Array<Record<string, unknown>>;
  groundingRules: Record<string, unknown>;
  motionPreset: string;
}

export interface ChildrenClipShotSkeleton {
  index: number; localIndex: number; sectionId: string; sectionTitle: string; sectionType: string;
  startSeconds: number; endSeconds: number; lyricText: string | null;
}

interface BuildPlanInput {
  title: string; concept: string; visualStyle: string; audienceAgeMin: number; audienceAgeMax: number;
  durationSeconds: number; beatGrid: number[]; sections: PlanningSection[]; cues: PlanningCue[];
  characters: PlanningCharacter[]; creative: CreativePlanResponse | null;
  existingVisualBible?: unknown; existingNarrative?: unknown;
  existingShots?: Array<Pick<PlannedChildrenClipShot, 'index' | 'startSeconds' | 'endSeconds' | 'musicSectionId' | 'lyricText'>>;
}

interface EntityDescriptor extends PlanningCharacter { type: string; identity: string; }

@Injectable()
export class ChildrenClipPlanningService {
  reconcileAuditedShotPlan(plan: CreativeShotPlan, characters: PlanningCharacter[]): CreativeShotPlan {
    const allowedNames = this.uniqueStrings([
      ...this.stringArray(plan.allowedEntities),
      ...this.stringArray(plan.characters)
    ]);
    const positiveSemantics = this.normalize([
      plan.primaryFocus,
      plan.purpose,
      plan.action,
      plan.composition,
      plan.camera,
      plan.motionIntent,
      plan.continuityFromPreviousShot,
      JSON.stringify(plan.characterPlacement ?? [])
    ].filter((item): item is string => typeof item === 'string').join(' '));
    for (const character of characters) {
      if (this.containsName(positiveSemantics, character.name)
        && !allowedNames.some((name) => this.sameText(name, character.name))) {
        allowedNames.push(character.name);
      }
    }
    const forbiddenNames = this.stringArray(plan.forbiddenEntities)
      .filter((name) => !allowedNames.some((allowed) => this.sameText(allowed, name)));
    return {
      ...plan,
      allowedEntities: allowedNames,
      characters: allowedNames,
      forbiddenEntities: forbiddenNames,
      semanticAuditPassed: true
    };
  }

  build(input: BuildPlanInput) {
    const existingVisualBible = this.record(input.existingVisualBible);
    const existingNarrative = this.record(input.existingNarrative);
    const creativeVisualBible = this.record(input.creative?.visualBible);
    const creativeNarrative = this.record(input.creative?.narrative);
    const visualBible = {
      style: input.visualStyle,
      palette: ['#FFD84D', '#61C9A8', '#5B8DEF', '#FF7A8A', '#FFF4D6'],
      lineStyle: 'contornos limpos, arredondados e consistentes',
      lighting: 'luz suave, alegre e sem sombras assustadoras',
      backgroundStyle: 'cenarios 2D em camadas, formas simples e profundidade por parallax',
      cameraRules: 'movimentos lentos, composicao legivel e cortes na grade musical',
      safetyRules: `adequado para criancas de ${input.audienceAgeMin} a ${input.audienceAgeMax} anos; sem perigo, violencia ou elementos assustadores`,
      characterRules: input.characters.map((character) => ({ name: character.name, role: character.roleName, type: 'character', approvedVersionId: character.versionId, identity: character.description })),
      ...existingVisualBible,
      ...creativeVisualBible
    };
    const narrative = {
      title: input.title, logline: input.concept, summary: input.concept,
      educationalMessage: 'amizade, cooperacao, curiosidade e resolucao positiva',
      tone: 'alegre, acolhedor, ritmico e facil de acompanhar',
      arc: ['apresentacao', 'descoberta', 'participacao', 'celebracao', 'despedida'],
      ...existingNarrative,
      ...creativeNarrative
    };
    const skeletons = input.existingShots?.length
      ? input.existingShots.map((shot) => {
        const section = input.sections.find((item) => item.id === shot.musicSectionId) ?? input.sections[0];
        return {
          index: shot.index,
          localIndex: input.existingShots!.filter((item) => item.musicSectionId === shot.musicSectionId && item.index < shot.index).length,
          sectionId: shot.musicSectionId,
          sectionTitle: section?.title ?? 'Secao', sectionType: section?.type ?? 'instrumental',
          startSeconds: shot.startSeconds, endSeconds: shot.endSeconds, lyricText: shot.lyricText
        };
      })
      : this.buildSkeletons(input);
    const { shots, locations } = this.buildShots(input, skeletons, visualBible, narrative);
    this.validate(shots, input.characters, narrative, visualBible);
    return { visualBible, narrative, locations, shots };
  }

  buildSkeletons(input: Pick<BuildPlanInput, 'durationSeconds' | 'beatGrid' | 'sections' | 'cues'>): ChildrenClipShotSkeleton[] {
    const skeletons: ChildrenClipShotSkeleton[] = [];
    for (const section of input.sections) {
      const count = Math.max(1, Math.ceil((section.endSeconds - section.startSeconds) / 7));
      const boundaries = this.sectionBoundaries(section.startSeconds, section.endSeconds, count, input.beatGrid);
      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        const startSeconds = boundaries[localIndex];
        const endSeconds = boundaries[localIndex + 1];
        const lyricText = input.cues.filter((cue) => cue.endSeconds > startSeconds && cue.startSeconds < endSeconds)
          .map((cue) => cue.text).join(' ').trim() || null;
        skeletons.push({ index: skeletons.length, localIndex, sectionId: section.id, sectionTitle: section.title, sectionType: section.type, startSeconds, endSeconds, lyricText });
      }
    }
    if (skeletons.length) { skeletons[0].startSeconds = 0; skeletons[skeletons.length - 1].endSeconds = input.durationSeconds; }
    return skeletons;
  }

  entityIntroductionSchedule(
    skeletons: ChildrenClipShotSkeleton[],
    characters: PlanningCharacter[],
    visualBible: unknown,
    narrative: unknown
  ) {
    const entities = this.entities(characters, this.record(visualBible));
    const indexes = this.introductionShotIndexes(skeletons, entities, this.record(narrative));
    return entities.map((entity) => ({
      name: entity.name,
      type: entity.type,
      firstShotIndex: indexes.get(entity.versionId) ?? 0
    }));
  }

  validate(shots: PlannedChildrenClipShot[], characters: PlanningCharacter[], narrative: Record<string, unknown>, visualBible: Record<string, unknown> = {}) {
    const knownIds = new Set(characters.map((item) => item.versionId));
    const globalTexts = [narrative.summary, narrative.logline].filter((item): item is string => typeof item === 'string').map((item) => this.normalize(item));
    const errors: string[] = [];
    const actionOwners = new Map<string, number>();
    const vehicleNames = this.entities(characters, visualBible)
      .filter((entity) => /\b(vehicle|veiculo|trem|train|bus|onibus)\b/.test(this.normalize(entity.type)))
      .map((entity) => entity.name);
    for (const shot of shots) {
      const allowed = new Set(shot.characterVersionIds);
      const forbidden = new Set(shot.forbiddenEntityVersionIds);
      if (allowed.size !== shot.characterVersionIds.length) errors.push(`Tomada ${shot.index + 1}: entidade permitida duplicada`);
      if (forbidden.size !== shot.forbiddenEntityVersionIds.length) errors.push(`Tomada ${shot.index + 1}: entidade proibida duplicada`);
      for (const id of allowed) {
        if (!knownIds.has(id)) errors.push(`Tomada ${shot.index + 1}: entidade permitida desconhecida`);
        if (forbidden.has(id)) errors.push(`Tomada ${shot.index + 1}: entidade permitida e proibida ao mesmo tempo`);
      }
      for (const id of forbidden) if (!knownIds.has(id)) errors.push(`Tomada ${shot.index + 1}: entidade proibida desconhecida`);
      const normalizedDescription = this.normalize(shot.description);
      const normalizedAction = this.normalize(shot.characterAction);
      if (this.hasUnsafeVehicleStaging(normalizedAction, vehicleNames)) {
        errors.push(`Tomada ${shot.index + 1}: acao coloca personagem em cima de um veiculo em movimento`);
      }
      const previousActionOwner = actionOwners.get(normalizedAction);
      if (normalizedAction && previousActionOwner !== undefined) {
        errors.push(`Tomada ${shot.index + 1}: acao visual repete exatamente a tomada ${previousActionOwner + 1}`);
      } else if (normalizedAction) {
        actionOwners.set(normalizedAction, shot.index);
      }
      if (normalizedDescription.length < 24) errors.push(`Tomada ${shot.index + 1}: descricao visual pouco especifica`);
      if (globalTexts.includes(normalizedDescription)) errors.push(`Tomada ${shot.index + 1}: descricao repete a narrativa global`);
      if (/\b(foco visual|entidades presentes|nao aparecem|permitidos|proibidos)\s*:/.test(normalizedDescription)) {
        errors.push(`Tomada ${shot.index + 1}: descricao visual mistura narrativa com metadados de entidades`);
      }
      const background = this.normalize(shot.backgroundPrompt);
      for (const character of characters) if (this.containsName(background, character.name)) errors.push(`Tomada ${shot.index + 1}: background inclui a entidade ${character.name}`);

      const normalizedFocus = this.normalize(shot.primaryFocus);
      const positiveSemantics = [
        normalizedDescription,
        this.normalize(shot.purpose),
        this.normalize(shot.framing),
        this.normalize(shot.cameraMovement),
        this.normalize(shot.characterAction),
        this.normalize(shot.motionIntent),
        this.normalize(shot.continuityFromPreviousShot),
        this.normalize(JSON.stringify(shot.characterPlacement))
      ].filter(Boolean).join(' ');
      for (const character of characters) {
        if (forbidden.has(character.versionId) && this.containsName(normalizedDescription, character.name)) {
          errors.push(`Tomada ${shot.index + 1}: descricao visual cita a entidade proibida ${character.name}`);
        }
        if (this.containsName(normalizedFocus, character.name) && !allowed.has(character.versionId)) {
          errors.push(`Tomada ${shot.index + 1}: foco ${character.name} nao esta nas entidades permitidas`);
        }
        if (this.containsName(positiveSemantics, character.name) && !allowed.has(character.versionId)) {
          errors.push(`Tomada ${shot.index + 1}: ${character.name} e descrito como presente ou ativo, mas nao esta nas entidades permitidas`);
        }
      }
    }
    if (errors.length) throw new Error(`Shot Plan invalido: ${errors.join('; ')}`);
  }

  private buildShots(input: BuildPlanInput, skeletons: ChildrenClipShotSkeleton[], visualBible: Record<string, unknown>, narrative: Record<string, unknown>) {
    const entities = this.entities(input.characters, visualBible);
    const introductions = this.introductionShotIndexes(skeletons, entities, narrative);
    const shotPlans = Array.isArray(input.creative?.shotPlans) ? input.creative.shotPlans : [];
    const locations = new Map<string, PlannedChildrenClipLocation>();
    const framings = ['plano geral', 'plano medio', 'close-up', 'plano conjunto'];
    const cameras = ['panoramica suave', 'aproximacao lenta', 'camera fixa com parallax', 'acompanhamento lateral'];
    const motions = ['gentle-bounce', 'sway-on-beat', 'walk-cycle', 'celebration-loop'];
    const style = this.environmentOnlyText(visualBible.style, entities, input.visualStyle, 'arte infantil 2D original, colorida e limpa');
    const backgroundStyle = this.environmentOnlyText(visualBible.backgroundStyle, entities, null, 'cenario infantil 2D em camadas');
    const lighting = this.environmentOnlyText(visualBible.lighting, entities, null, 'luz suave e alegre');
    const storyBeats = this.arrayOfRecords(narrative.storyBeats);

    const shots = skeletons.map((skeleton, arrayIndex): PlannedChildrenClipShot => {
      const index = skeleton.index;
      const generated = shotPlans.find((item) => item.shotIndex === index) ?? {};
      const storyBeat = storyBeats.find((item) => this.sameText(item.section, skeleton.sectionTitle));
      const legacySectionPlan = Array.isArray(input.creative?.sectionPlans)
        ? input.creative.sectionPlans.find((item) => this.sameText(item.sectionTitle, skeleton.sectionTitle)) : undefined;
      const locationKey = this.slug(generated.locationKey || skeleton.sectionTitle || skeleton.sectionType);
      const creativeLocation = Array.isArray(input.creative?.locations)
        ? input.creative.locations.find((item) => this.slug(item.key || item.name || '') === locationKey) : undefined;
      const locationName = this.environmentOnlyText(generated.locationName, entities, creativeLocation?.name,
        `Cenario ${skeleton.sectionType || 'principal'}`);
      const locationDescription = this.environmentOnlyText(generated.locationDescription, entities, creativeLocation?.description,
        `Ambiente infantil da secao ${skeleton.sectionTitle}, com formas simples e leitura visual clara`);
      const timeOfDay = this.environmentOnlyText(generated.timeOfDay, entities, creativeLocation?.timeOfDay, 'iluminacao clara e consistente');
      if (!locations.has(locationKey)) locations.set(locationKey, {
        key: locationKey, name: locationName, description: locationDescription, timeOfDay,
        visualPrompt: this.environmentOnlyText(creativeLocation?.visualPrompt, entities, null, `${locationDescription}. ${timeOfDay}. ${backgroundStyle}.`),
        continuityRules: this.stringArray(creativeLocation?.continuityRules).length ? this.stringArray(creativeLocation?.continuityRules) : ['manter arquitetura, paleta, iluminacao, vegetacao e orientacao espacial entre tomadas']
      });

      const introduced = entities.filter((entity) => (introductions.get(entity.versionId) ?? 0) <= index);
      const requestedNames = this.uniqueStrings([...this.stringArray(generated.allowedEntities), ...this.stringArray(generated.characters), ...(generated.primaryFocus ? [generated.primaryFocus] : [])]);
      const fallbackFocus = this.stringArray(storyBeat?.focus);
      const selectedNames = requestedNames.length ? requestedNames : fallbackFocus;
      const allowed = entities.filter((entity) => introduced.some((item) => item.versionId === entity.versionId)
        && selectedNames.some((name) => this.sameText(name, entity.name)));
      const explicitForbidden = this.stringArray(generated.forbiddenEntities);
      const forbidden = entities.filter((entity) => !allowed.some((item) => item.versionId === entity.versionId) || explicitForbidden.some((name) => this.sameText(name, entity.name)));
      const primaryFocus = this.clean(generated.primaryFocus) || allowed[0]?.name || this.stringArray(storyBeat?.focus)[0] || null;
      const framing = this.clean(generated.composition) || framings[index % framings.length];
      const camera = this.clean(generated.camera) || cameras[index % cameras.length];
      const narrativeGuidance = this.clean(storyBeat?.visualGuidance);
      const action = this.clean(generated.action) || this.clean(legacySectionPlan?.action) || (narrativeGuidance
        ? `Momento ${skeleton.localIndex + 1}: ${narrativeGuidance}${skeleton.lyricText ? ` Interpretar especificamente a letra "${skeleton.lyricText}".` : ''}`
        : skeleton.lyricText
          ? `Momento ${skeleton.localIndex + 1}: representar visualmente a letra "${skeleton.lyricText}" com uma acao unica, clara e infantil`
          : `Momento ${skeleton.localIndex + 1}: criar uma acao instrumental especifica da secao ${skeleton.sectionTitle}, com gestos simples no ritmo`);
      const purpose = this.clean(generated.purpose) || this.clean(storyBeat?.purpose) || `Contar visualmente o trecho ${skeleton.localIndex + 1} da secao ${skeleton.sectionTitle}`;
      const emotion = this.clean(generated.emotion) || this.clean(legacySectionPlan?.mood) || 'alegre e acolhedor';
      const motionIntent = this.clean(generated.motionIntent) || 'movimento simples, legivel e sincronizado com a musica';
      const objects = this.uniqueStrings(this.stringArray(generated.objects));
      const previousPlan = arrayIndex > 0 ? shotPlans.find((item) => item.shotIndex === skeletons[arrayIndex - 1].index) : undefined;
      const previousLocationKey = arrayIndex > 0 ? this.slug(previousPlan?.locationKey || skeletons[arrayIndex - 1].sectionTitle) : null;
      const continuity = generated.continuityFromPreviousShot === null ? null : this.clean(generated.continuityFromPreviousShot) ||
        (previousLocationKey === locationKey ? `Manter o mesmo design, iluminacao e orientacao de ${locationName} da tomada anterior` : null);
      const description = [
        `${this.capitalize(framing)} em ${locationName}, ${timeOfDay}.`,
        action.endsWith('.') ? action : `${action}.`
      ].filter(Boolean).join(' ');
      const location = locations.get(locationKey)!;
      const compositionPlan = this.compositionPlan(allowed, generated, framing, index);
      const backgroundContinuity = this.environmentOnlyText(continuity, entities, null, '');
      const backgroundFraming = this.environmentOnlyText(framing, entities, null, 'plano geral do ambiente');
      const backgroundCamera = this.environmentOnlyText(camera, entities, null, 'camera ambiental fixa com parallax suave');
      const backgroundPrompt = [style, backgroundStyle, lighting, `background plate vazio de ${location.name}: ${location.visualPrompt}`,
        `enquadramento ambiental: ${backgroundFraming}; camera: ${backgroundCamera}`,
        `reservar areas vazias para composicao: ${compositionPlan.backgroundSafeZones.map((zone) => `${zone.name} em x ${zone.xPercent}%, y ${zone.yPercent}%, largura ${zone.widthPercent}%, altura ${zone.heightPercent}%`).join('; ')}`,
        `plano de chao claro em ${compositionPlan.groundingRules.groundLinePercent}% da altura, horizonte em ${compositionPlan.groundingRules.horizonPercent}%, perspectiva ${compositionPlan.groundingRules.perspective}, escala coerente e espaco de movimento`, backgroundContinuity,
        'somente ambiente, sem pessoas, personagens, animais, criaturas, mascotes ou veiculos cadastrados; sem texto'].filter(Boolean).join('. ');
      return {
        musicSectionId: skeleton.sectionId, locationKey, index, title: `${skeleton.sectionTitle} - tomada ${skeleton.localIndex + 1}`,
        description, purpose, primaryFocus, timeOfDay, emotion, motionIntent, continuityFromPreviousShot: continuity,
        startSeconds: skeleton.startSeconds, endSeconds: skeleton.endSeconds,
        durationSeconds: Number((skeleton.endSeconds - skeleton.startSeconds).toFixed(3)), framing, cameraMovement: camera,
        characterAction: action, environment: location.description, backgroundPrompt,
        transitionIn: index === 0 ? 'fade-in' : 'cut-on-beat', transitionOut: skeleton.endSeconds === input.durationSeconds ? 'fade-out' : 'cut-on-beat',
        lyricText: skeleton.lyricText, characterVersionIds: allowed.map((item) => item.versionId),
        forbiddenEntityVersionIds: forbidden.map((item) => item.versionId), objects,
        layers: [{ type: 'background', depth: 0, locationKey }, ...allowed.map((entity, entityIndex) => ({ type: ['vehicle', 'object'].includes(entity.type) ? 'entity' : 'character', depth: entityIndex + 1, versionId: entity.versionId, name: entity.name })), { type: 'foreground', depth: 10, optional: true }],
        characterPlacement: compositionPlan.characterPlacement,
        backgroundSafeZones: compositionPlan.backgroundSafeZones,
        groundingRules: compositionPlan.groundingRules,
        motionPreset: motions[index % motions.length]
      };
    });
    return { shots, locations: [...locations.values()] };
  }

  private entities(characters: PlanningCharacter[], visualBible: Record<string, unknown>): EntityDescriptor[] {
    const rules = this.arrayOfRecords(visualBible.characterRules);
    return characters.map((character) => {
      const rule = rules.find((item) => this.sameText(item.name, character.name));
      return { ...character, type: this.clean(rule?.type) || 'character', identity: this.clean(rule?.identity) || character.description };
    });
  }

  private compositionPlan(allowed: EntityDescriptor[], generated: CreativeShotPlan, framing: string, index: number) {
    const defaultXs = allowed.length <= 1 ? [50] : allowed.length === 2 ? [35, 65] : allowed.map((_, itemIndex) => Math.round(20 + (60 * itemIndex) / Math.max(1, allowed.length - 1)));
    const requested = Array.isArray(generated.characterPlacement) ? generated.characterPlacement : [];
    const subjects = allowed.map((entity, entityIndex) => {
      const explicit = requested.find((item) => this.sameText(item.entity, entity.name));
      return {
        versionId: entity.versionId,
        name: entity.name,
        zone: this.clean(explicit?.zone) || (defaultXs[entityIndex] < 42 ? 'left' : defaultXs[entityIndex] > 58 ? 'right' : 'center'),
        xPercent: this.percent(explicit?.xPercent, defaultXs[entityIndex]),
        yPercent: this.percent(explicit?.yPercent, 76),
        scalePercent: this.percent(explicit?.scalePercent, this.normalize(framing).includes('close') ? 72 : 48),
        facing: this.clean(explicit?.facing) || (defaultXs[entityIndex] <= 50 ? 'right' : 'left')
      };
    });
    const safeZones = subjects.length ? subjects.map((subject, subjectIndex) => ({
      name: `character-${subjectIndex + 1}`,
      xPercent: Math.max(0, subject.xPercent - 14), yPercent: 28,
      widthPercent: 28, heightPercent: 58,
      purpose: `espaco limpo para ${subject.name} e seu movimento`
    })) : [{ name: 'action-center', xPercent: 25, yPercent: 30, widthPercent: 50, heightPercent: 55, purpose: 'area limpa para composicao posterior' }];
    const grounding = generated.grounding && typeof generated.grounding === 'object' ? generated.grounding : {};
    return {
      characterPlacement: { strategy: 'safe-zone-layout', subjects, movementDirection: this.clean(grounding.movementDirection) || (index % 2 === 0 ? 'left-to-right' : 'right-to-left') },
      backgroundSafeZones: safeZones,
      groundingRules: {
        groundLinePercent: this.percent(grounding.groundLinePercent, 78),
        horizonPercent: this.percent(grounding.horizonPercent, 42),
        perspective: this.clean(grounding.perspective) || 'gentle eye-level perspective suitable for 2D character compositing',
        requireContactShadows: true, preserveScaleAcrossLocation: true
      }
    };
  }

  private introductionShotIndexes(skeletons: ChildrenClipShotSkeleton[], entities: EntityDescriptor[], narrative: Record<string, unknown>) {
    const introductions = new Map<string, number>();
    const explicit = this.arrayOfRecords(narrative.entityIntroductions);
    const storyBeats = Array.isArray(narrative.storyBeats) ? narrative.storyBeats : [];
    const introductionOrder = Array.isArray(narrative.characterIntroductionOrder) ? narrative.characterIntroductionOrder : [];
    entities.forEach((entity, entityIndex) => {
      const explicitRule = explicit.find((item) => this.sameText(item.entityName, entity.name));
      const explicitShot = Number(explicitRule?.firstShotIndex);
      if (Number.isInteger(explicitShot) && explicitShot >= 0) { introductions.set(entity.versionId, explicitShot); return; }
      const lyricAliases = this.entityLyricAliases(entity);
      const lyricMention = skeletons.find((shot) => {
        const lyric = this.normalize(shot.lyricText);
        return lyricAliases.some((alias) => this.containsName(lyric, alias));
      });
      const beatIndex = storyBeats.findIndex((item) => typeof item === 'string'
        ? this.containsName(this.normalize(item), entity.name)
        : this.isRecord(item) && (
          this.stringArray(item.focus).some((name) => this.sameText(name, entity.name))
          || this.containsName(this.normalize(item.purpose), entity.name)
          || this.containsName(this.normalize(item.visualGuidance), entity.name)
        ));
      const beat = beatIndex >= 0 && this.isRecord(storyBeats[beatIndex]) ? storyBeats[beatIndex] : null;
      const beatShot = beat
        ? skeletons.find((shot) => this.sameText(shot.sectionTitle, beat.section)) ?? skeletons[Math.min(beatIndex, skeletons.length - 1)]
        : beatIndex >= 0 ? skeletons[Math.min(beatIndex, skeletons.length - 1)] : undefined;
      const orderedIndex = introductionOrder.findIndex((item) => typeof item === 'string'
        ? this.sameText(item, entity.name)
        : this.isRecord(item) && this.sameText(item.name ?? item.entityName, entity.name));
      const fallbackIndex = orderedIndex >= 0 ? orderedIndex : entityIndex;
      const orderFallback = skeletons[Math.min(fallbackIndex, Math.max(0, skeletons.length - 1))];
      introductions.set(entity.versionId, lyricMention?.index ?? beatShot?.index ?? orderFallback?.index ?? 0);
    });
    return introductions;
  }

  private sectionBoundaries(start: number, end: number, count: number, beats: number[]) {
    const boundaries = [start];
    for (let index = 1; index < count; index += 1) {
      const ideal = start + ((end - start) * index) / count;
      const candidates = beats.filter((beat) => beat > boundaries[index - 1] + 2 && beat < end - 2);
      const nearest = candidates.reduce((best, beat) => Math.abs(beat - ideal) < Math.abs(best - ideal) ? beat : best, ideal);
      boundaries.push(Number(nearest.toFixed(3)));
    }
    boundaries.push(end);
    return boundaries;
  }

  private arrayOfRecords(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => this.isRecord(item)) : []; }
  private record(value: unknown): Record<string, unknown> { return this.isRecord(value) ? value : {}; }
  private isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  private stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []; }
  private uniqueStrings(values: string[]) { return [...new Map(values.map((value) => [this.normalize(value), value.trim()])).values()].filter(Boolean); }
  private clean(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
  private shortText(value: unknown, fallback: string) { const text = this.clean(value) || fallback; return text.length > 700 ? `${text.slice(0, 697)}...` : text; }
  private environmentOnlyText(value: unknown, entities: EntityDescriptor[], secondary: unknown, fallback: string) {
    for (const candidate of [value, secondary, fallback]) {
      const text = this.clean(candidate);
      if (!text) continue;
      const safe = text.split(/(?<=[.!?;])\s+|,\s+/)
        .filter((fragment) => fragment.trim() && !entities.some((entity) => this.containsName(this.normalize(fragment), entity.name)))
        .join(', ').trim();
      if (safe) return this.shortText(safe, fallback);
    }
    return fallback;
  }
  private normalize(value: unknown): string { return typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() : ''; }
  private containsName(normalizedText: string, name: string) { const target = this.normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return target.length > 1 && new RegExp(`(^|[^a-z0-9])${target}($|[^a-z0-9])`).test(normalizedText); }
  private sameText(left: unknown, right: unknown) { const a = this.normalize(left); const b = this.normalize(right); return Boolean(a && b && a === b); }
  private entityLyricAliases(entity: EntityDescriptor): string[] {
    const descriptor = this.normalize(`${entity.type} ${entity.identity}`);
    const aliases = [entity.name];
    if (/\b(cachorro|cachorrinho|cao|filhote)\b/.test(descriptor)) aliases.push('cachorro', 'cachorrinho', 'cao');
    if (/\b(gato|gata|gatinho|gatinha|felino)\b/.test(descriptor)) aliases.push('gato', 'gata', 'gatinho', 'gatinha');
    if (/\b(coelho|coelha|coelhinho|coelhinha)\b/.test(descriptor)) aliases.push('coelho', 'coelha', 'coelhinho', 'coelhinha');
    if (/\b(vehicle|veiculo|trem|train|locomotiva)\b/.test(descriptor)) aliases.push('trem', 'trenzinho', 'locomotiva');
    return this.uniqueStrings(aliases);
  }
  private hasUnsafeVehicleStaging(normalizedText: string, vehicleNames: string[]) {
    if (/\b(em cima|sobre o teto) d[oa] (trem|veiculo|carro|onibus)\b/.test(normalizedText)) return true;
    return vehicleNames.some((name) => {
      const target = this.normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b(em cima|sobre o teto) d[oa] ${target}\\b`).test(normalizedText);
    });
  }
  private slug(value: string) { return this.normalize(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'location'; }
  private capitalize(value: string) { return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value; }
  private percent(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback; }
}
