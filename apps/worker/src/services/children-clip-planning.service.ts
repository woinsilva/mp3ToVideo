import { Injectable } from '@nestjs/common';

interface PlanningSection {
  id: string;
  title: string;
  type: string;
  startSeconds: number;
  endSeconds: number;
  lyricsExcerpt: string | null;
  energy: number | null;
}

interface PlanningCue {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

interface PlanningCharacter {
  name: string;
  roleName: string | null;
  versionId: string;
  description: string;
}

export interface CreativePlanResponse {
  visualBible?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  sectionPlans?: Array<{
    sectionTitle?: string;
    environment?: string;
    action?: string;
    mood?: string;
  }>;
}

export interface PlannedChildrenClipShot {
  musicSectionId: string;
  index: number;
  title: string;
  description: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  framing: string;
  cameraMovement: string;
  characterAction: string;
  environment: string;
  backgroundPrompt: string;
  transitionIn: string | null;
  transitionOut: string | null;
  lyricText: string | null;
  characterVersionIds: string[];
  layers: Array<Record<string, unknown>>;
  motionPreset: string;
}

interface BuildPlanInput {
  title: string;
  concept: string;
  visualStyle: string;
  audienceAgeMin: number;
  audienceAgeMax: number;
  durationSeconds: number;
  beatGrid: number[];
  sections: PlanningSection[];
  cues: PlanningCue[];
  characters: PlanningCharacter[];
  creative: CreativePlanResponse | null;
}

@Injectable()
export class ChildrenClipPlanningService {
  build(input: BuildPlanInput) {
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
      characterRules: input.characters.map((character) => ({
        name: character.name,
        role: character.roleName,
        approvedVersionId: character.versionId,
        identity: character.description
      })),
      ...creativeVisualBible
    };
    const narrative = {
      title: input.title,
      logline: input.concept,
      summary: input.concept,
      educationalMessage: 'amizade, cooperacao, curiosidade e resolucao positiva',
      tone: 'alegre, acolhedor, ritmico e facil de acompanhar',
      arc: ['apresentacao', 'descoberta', 'participacao', 'celebracao', 'despedida'],
      ...creativeNarrative
    };
    const shots = this.buildShots(input);
    return { visualBible, narrative, shots };
  }

  private buildShots(input: BuildPlanInput): PlannedChildrenClipShot[] {
    const shots: PlannedChildrenClipShot[] = [];
    const framings = ['plano geral', 'plano medio', 'close-up', 'plano conjunto'];
    const cameras = ['panoramica suave', 'aproximacao lenta', 'camera fixa com parallax', 'acompanhamento lateral'];
    const motions = ['gentle-bounce', 'sway-on-beat', 'walk-cycle', 'celebration-loop'];
    for (const section of input.sections) {
      const sectionDuration = section.endSeconds - section.startSeconds;
      const count = Math.max(1, Math.ceil(sectionDuration / 7));
      const sectionPlans = Array.isArray(input.creative?.sectionPlans) ? input.creative.sectionPlans : [];
      const sectionPlan = sectionPlans.find((item) =>
        item.sectionTitle?.toLowerCase() === section.title.toLowerCase());
      const environment = sectionPlan?.environment?.trim() || this.defaultEnvironment(section.type, input.concept);
      const action = sectionPlan?.action?.trim() || `Os personagens vivem uma acao simples ligada a ${input.concept}`;
      const boundaries = this.sectionBoundaries(section.startSeconds, section.endSeconds, count, input.beatGrid);
      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        const startSeconds = boundaries[localIndex];
        const endSeconds = boundaries[localIndex + 1];
        const lyricText = input.cues
          .filter((cue) => cue.endSeconds > startSeconds && cue.startSeconds < endSeconds)
          .map((cue) => cue.text).join(' ').trim() || null;
        const index = shots.length;
        const activeCharacters = input.characters.length
          ? [input.characters[index % input.characters.length]]
          : [];
        const characterAction = lyricText
          ? `${action}. Interpreta visualmente a frase: ${lyricText}`
          : `${action}. Momento instrumental com gestos claros no ritmo.`;
        shots.push({
          musicSectionId: section.id,
          index,
          title: `${section.title} - tomada ${localIndex + 1}`,
          description: `${environment}. ${characterAction}`,
          startSeconds,
          endSeconds,
          durationSeconds: Number((endSeconds - startSeconds).toFixed(3)),
          framing: framings[index % framings.length],
          cameraMovement: cameras[index % cameras.length],
          characterAction,
          environment,
          backgroundPrompt: `${input.visualStyle}. ${environment}. Children's 2D animation background, clean layers, no characters, no text.`,
          transitionIn: index === 0 ? 'fade-in' : 'cut-on-beat',
          transitionOut: section.endSeconds === input.durationSeconds ? 'fade-out' : 'cut-on-beat',
          lyricText,
          characterVersionIds: activeCharacters.map((character) => character.versionId),
          layers: [
            { type: 'background', depth: 0, prompt: environment },
            ...activeCharacters.map((character, characterIndex) => ({
              type: 'character', depth: characterIndex + 1, versionId: character.versionId, name: character.name
            })),
            { type: 'foreground', depth: 10, optional: true }
          ],
          motionPreset: motions[index % motions.length]
        });
      }
    }
    if (shots.length) {
      shots[0].startSeconds = 0;
      shots[shots.length - 1].endSeconds = input.durationSeconds;
      shots[shots.length - 1].durationSeconds = Number((input.durationSeconds - shots[shots.length - 1].startSeconds).toFixed(3));
    }
    return shots;
  }

  private sectionBoundaries(start: number, end: number, count: number, beats: number[]) {
    const boundaries = [start];
    for (let index = 1; index < count; index += 1) {
      const ideal = start + ((end - start) * index) / count;
      const candidates = beats.filter((beat) => beat > boundaries[index - 1] + 2 && beat < end - 2);
      const nearest = candidates.reduce((best, beat) =>
        Math.abs(beat - ideal) < Math.abs(best - ideal) ? beat : best, ideal);
      boundaries.push(Number(nearest.toFixed(3)));
    }
    boundaries.push(end);
    return boundaries;
  }

  private defaultEnvironment(type: string, concept: string) {
    if (type === 'intro') return `Plano de apresentacao do universo de ${concept}`;
    if (type === 'chorus') return `Espaco amplo e colorido para danca coletiva sobre ${concept}`;
    if (type === 'outro') return `Cenario acolhedor de despedida no universo de ${concept}`;
    return `Cenario infantil em camadas que desenvolve ${concept}`;
  }

  private record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }
}
