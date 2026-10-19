export const APP_NAME = 'Video SaaS MVP';

export const PROJECT_QUEUE_NAME = 'project-processing';
export const PROJECT_PROCESS_JOB_NAME = 'project.process';
export const FRAME_INTERPOLATION_QUEUE_NAME = 'frame-interpolation';
export const FRAME_INTERPOLATION_JOB_NAME = 'render.interpolate';
export const CHILDREN_CLIP_QUEUE_NAME = 'children-clip-production';

export const SNAPGEN_VIDEO_MODELS = {
  'veo-3.1-fast': {
    label: 'Veo 3.1 Fast',
    durations: [8] as const,
    resolutions: ['720p', '1080p'] as const,
    aspectRatios: ['16:9', '9:16'] as const,
    referenceModes: ['frame', 'ingredient'] as const,
    maxIngredientImages: 3
  }
} as const;

export type SnapGenVideoModel = keyof typeof SNAPGEN_VIDEO_MODELS;
export const CHILDREN_CLIP_CHARACTER_GENERATE_JOB_NAME = 'children-clip.character.generate';
export const CHILDREN_CLIP_AUDIO_ANALYZE_JOB_NAME = 'children-clip.audio.analyze';
export const CHILDREN_CLIP_PLAN_GENERATE_JOB_NAME = 'children-clip.plan.generate';
export const CHILDREN_CLIP_ASSET_GENERATE_JOB_NAME = 'children-clip.asset.generate';
export const CHILDREN_CLIP_SHOT_RENDER_JOB_NAME = 'children-clip.shot.render2d';
export const CHILDREN_CLIP_HERO_SHOT_JOB_NAME = 'children-clip.shot.wan';
export const CHILDREN_CLIP_FINAL_RENDER_JOB_NAME = 'children-clip.final.render';
export const GPU_LEASE_KEY = 'video-saas:gpu:lease';

const SHOT_ACTION_STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'enquanto', 'no', 'nos', 'o', 'os',
  'para', 'pela', 'pelas', 'pelo', 'pelos', 'que', 'se', 'um', 'uma', 'uns', 'umas', 'seu', 'sua', 'seus', 'suas',
  'centro', 'direita', 'esquerda', 'fundo', 'cena', 'ritmo', 'musica', 'suave', 'suavemente', 'animado', 'animada',
  'animados', 'animadas', 'alegre', 'alegres', 'movimento', 'movimentos'
]);

export function normalizeShotSemantics(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function shotActionTokens(value: unknown): Set<string> {
  const normalized = normalizeShotSemantics(value)
    .replace(/\b(mais|muito|ligeiramente|novamente|outra vez)\b/g, ' ')
    .replace(/\b(inicia|iniciam|comeca|comecam|comecou|iniciou)\b/g, ' iniciar ')
    .replace(/\b(danca|dancam|dancando)\b/g, ' dancar ')
    .replace(/\b(pula|pulam|pulando)\b/g, ' pular ')
    .replace(/\b(corre|correm|correndo)\b/g, ' correr ')
    .replace(/\b(acena|acenam|acenando)\b/g, ' acenar ');
  return new Set(normalized.split(' ').filter((token) => token.length > 2 && !SHOT_ACTION_STOP_WORDS.has(token)));
}

export function shotActionsAreTooSimilar(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeShotSemantics(left);
  const normalizedRight = normalizeShotSemantics(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  const leftTokens = shotActionTokens(left);
  const rightTokens = shotActionTokens(right);
  if (Math.min(leftTokens.size, rightTokens.size) < 4) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = union ? intersection / union : 0;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  return jaccard >= 0.68 || containment >= 0.82;
}

export function unapprovedVisualExtra(value: unknown): string | null {
  const text = normalizeShotSemantics(value);
  const match = text.match(/\b(passageiros?|pessoas?|criancas?|multidao|figurantes?|figura humana|alguem visivel|cachorros?|cachorrinhos?|caes|gatos?|gatinhos?|gatinhas?|coelhos?|coelhinhos?|grupo|todos|demais)\b/);
  return match?.[0] ?? null;
}

export function shotActionIsVague(value: unknown): boolean {
  const text = normalizeShotSemantics(value);
  const meaningfulTokens = [...shotActionTokens(text)];
  if (meaningfulTokens.length < 5) return true;
  return /\b(se move com movimento|brinca com o som|grupo se junta|grupo danca e celebra|todos dancam com)\b/.test(text);
}

export function genericShotLocation(value: unknown): boolean {
  return /^cenario (?:intro|verse|chorus|bridge|outro)(?:\b|_)/.test(normalizeShotSemantics(value));
}

export function visibleWrittenTextIssue(value: unknown): string | null {
  const text = normalizeShotSemantics(value).replace(/\bsem texto\b/g, '');
  if (/\b(inscricao|texto|palavra escrita|frase escrita|legenda)\b/.test(text)) return 'texto escrito visivel nao permitido na cena';
  if (/\bplaca\b.{0,55}\b(exibe|mostra|diz|escrito|inscricao|palavra|frase)\b/.test(text)) return 'placa com texto visivel nao permitida na cena';
  return null;
}

export function shotGrammarIssue(value: unknown): string | null {
  const text = normalizeShotSemantics(value);
  const coordinatedNames = '(?:lia|toto|mimi|lilo)\\s*(?:,\\s*(?:lia|toto|mimi|lilo)\\s*)*(?:e\\s+(?:lia|toto|mimi|lilo))';
  const singularVerb = '(?:acena|alterna|aponta|abre|avanca|bate|celebra|coloca|corre|entra|ergue|espera|estende|faz|fecha|fica|levanta|marca|mostra|observa|olha|pega|pisa|pula|puxa|reduz|responde|salta|sobe|toca)';
  if (new RegExp(`\\b${coordinatedNames}\\s+${singularVerb}\\b`).test(text)) {
    return 'sujeito composto usa verbo no singular';
  }
  if (/\b(?:lia|toto|mimi|lilo)(?:\s*,?\s*(?:e|,)\s*(?:lia|toto|mimi|lilo))*\s+(?:pular|saltar|correr|dancar|bater)\b/.test(text)) {
    return 'acao com verbo no infinitivo e concordancia incorreta';
  }
  if (/\bpuxam a\b/.test(text)) return 'pronome obliquo escrito de forma incorreta';
  return null;
}

export function lyricActionIssue(lyricValue: unknown, actionValue: unknown): string | null {
  const lyric = normalizeShotSemantics(lyricValue);
  const action = normalizeShotSemantics(actionValue);
  if (!lyric || !action) return null;
  if (/\bpula(?:r|m|ndo)?\b/.test(lyric) && !/\b(pula|pulam|pulando|salta|saltam|saltando|saltos?)\b/.test(action)) {
    return 'a letra pede um salto, mas a acao nao mostra nenhum salto';
  }
  if (/\bbate palma\b/.test(lyric) && !/\b(palma|palmas)\b/.test(action)) {
    return 'a letra pede palmas, mas a acao nao mostra palmas';
  }
  if (/\bbate (?:o )?pe\b/.test(lyric) && !/\b(pisa|pisam|pe|pes)\b.{0,30}\b(chao|piso|marca)\b|\b(chao|piso|marca)\b.{0,30}\b(pe|pes)\b/.test(action)) {
    return 'a letra pede bater o pe, mas a acao nao mostra o gesto';
  }
  if (/\bdevagar\b/.test(lyric) && !/\b(devagar|lentamente|reduz|reduzem|desacelera|desaceleram|freia|freiam)\b/.test(action)) {
    return 'a letra pede movimento devagar, mas a acao nao mostra a desaceleracao';
  }
  if (/\bacelerar\b/.test(lyric) && !/\b(acelera|aceleram|acelerando|ganha velocidade)\b/.test(action)) {
    return 'a letra pede aceleracao, mas a acao nao mostra o aumento de velocidade';
  }
  if (/\bvai pra la e vem pra ca\b/.test(lyric) && !/\b(lado a lado|de um lado para o outro|esquerda.{0,35}direita|direita.{0,35}esquerda|vai e volta)\b/.test(action)) {
    return 'a letra pede movimento de um lado para o outro, mas a acao nao o mostra';
  }
  if (/\b(pode embarcar|quem entrou|entrou no|pulou dentro do vagao)\b/.test(lyric)
    && !/\b(entra|entram|embarca|embarcam|atravessa|atravessam|sobe|sobem)\b.{0,70}\b(porta|entrada|rampa|degrau|vagao|trem|trenzinho|pipo express)\b/.test(action)
    && !/\b(ja dentro|acomoda|acomodam|sentado|sentada|sentados|sentadas)\b.{0,70}\b(vagao|trem|trenzinho|pipo express)\b/.test(action)) {
    return 'a letra pede embarque, mas a acao nao mostra alguem entrando no veiculo';
  }
  return null;
}

export function vehicleActionIssue(value: unknown, vehicleNames: string[]): string | null {
  const text = normalizeShotSemantics(value)
    .replace(/\b(area|marca|zona|faixa|distancia|plataforma) segura\b/g, '$1 protegida');
  if (!text) return null;
  const escapedVehicles = vehicleNames
    .map((name) => normalizeShotSemantics(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean);
  const vehicleTerm = escapedVehicles.length ? `(?:trem|trenzinho|veiculo|carro|onibus|vagao|locomotiva|${escapedVehicles.join('|')})` : '(?:trem|trenzinho|veiculo|carro|onibus|vagao|locomotiva)';
  if (new RegExp(`\\b(em cima|sobre o teto) d[oa] ${vehicleTerm}\\b`).test(text)) return 'personagem em cima de um veiculo';
  if (/\b(sobre uma trilha|brinca(?:m)? com (?:as )?trilh|danca(?:m)? (?:nos?|sobre os?) trilhos|fica(?:m)? (?:nos?|sobre os?) trilhos)\b/.test(text)) return 'personagem vivo nos trilhos';
  if (new RegExp(`\\b(segura|seguram|puxa|puxam|empurra|empurram)\\b.{0,50}\\b${vehicleTerm}\\b`).test(text)) return 'personagem manipulando veiculo de forma incoerente';
  if (new RegExp(`\\b${vehicleTerm}\\b.{0,70}\\b(empurrando|puxando|segurando|o empurra|o puxa|o segura)\\b`).test(text)) return 'personagem manipulando veiculo de forma incoerente';

  const boarding = /\b(entra|entram|embarcam?)\b.{0,60}\b(porta|entrada|vagao|trem|pipo express)\b/.test(text)
    || /\b(pula|pulam|salta|saltam)\b.{0,35}\b(dentro|para dentro|vagao)\b/.test(text);
  if (boarding && (!/\b(porta|entrada)\b/.test(text) || !/\b(parado|parada|imovel|estacionado|estacionada)\b/.test(text))) {
    return 'embarque sem porta e veiculo parado';
  }

  const vehicleStartsMoving = new RegExp(
    `\\b${vehicleTerm}\\b.{0,90}(?:\\b(?:comeca|comecam|inicia|iniciam)\\b.{0,20}\\b(?:mover|movimentar|andar|rodar)\\b|\\b(?:parte|partem|arranca|arrancam)\\b)`
  ).test(text);
  if (boarding && vehicleStartsMoving) {
    return 'embarque simultaneo ao inicio do movimento do veiculo';
  }

  // Evaluate simultaneous actions inside the same temporal phase. A character may
  // finish a safe gesture first and the stopped vehicle may depart afterwards.
  const temporalPhases = text.split(/\b(?:depois|em seguida|apos isso)\b/);
  for (const phase of temporalPhases) {
    const movingVehicle = new RegExp(`\\b${vehicleTerm}\\b.{0,70}\\b(move|movem|mover|movendo|movimenta|movimentam|movimento|passa|avanca|acelera|parte|aproxima|aproximando|chega|faz uma curva)\\b`).test(phase);
    if (movingVehicle && !/\b(dentro|no interior)\b/.test(phase) && /\b(corre|correm|correndo|danca|dancam|pula|pulam|salta|saltam|se junta|aproxima|aproximam)\b/.test(phase)) {
      return 'personagem acompanhando veiculo em movimento de forma insegura';
    }
    if (movingVehicle && /\b(ao lado|ao redor|em volta)\b.{0,45}\b(corre|correm|danca|dancam|pula|pulam|salta|saltam)\b/.test(phase)) {
      return 'personagem acompanhando veiculo em movimento de forma insegura';
    }
  }
  const circlesVehicle = new RegExp(`\\b(ao redor|em volta)\\b.{0,55}\\b${vehicleTerm}\\b|\\b${vehicleTerm}\\b.{0,55}\\b(ao redor|em volta)\\b`).test(text);
  if (circlesVehicle && !/\b(parado|parada|imovel|estacionado|estacionada)\b/.test(text)) {
    return 'personagens ao redor de veiculo sem confirmar que esta parado';
  }
  if (new RegExp(`\\b(danca|dancam)\\b.{0,35}\\bcom (?:o )?${vehicleTerm}\\b`).test(text)) {
    return 'danca ambigua com veiculo';
  }
  for (const vehicle of escapedVehicles) {
    if (new RegExp(`\\b${vehicle}\\b(?: tambem| alegremente| junto)? \\b(pula|pulam|danca|dancam|abraca|abracam|bate palmas|cantam?)\\b`).test(text)) {
      return 'veiculo executando acao corporal de personagem vivo';
    }
  }
  return null;
}

export interface ProjectProcessingJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
}

export interface FrameInterpolationJobPayload {
  projectId: string;
  organizationId: string;
  sourceAssetId: string;
}

export interface ChildrenClipCharacterGenerationJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  characterId: string;
  characterVersionId: string;
  characterAssetId?: string;
}

export interface ChildrenClipAudioAnalysisJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
}

export interface ChildrenClipPlanGenerationJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  revisionInstruction?: string | null;
  mode?: 'full' | 'shots_only';
}

export interface ChildrenClipAssetGenerationJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  shotAssetId: string;
}

export interface ChildrenClipShotRenderJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  renderAttemptId: string;
}

export interface ChildrenClipHeroShotJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  heroAttemptId: string;
}

export interface ChildrenClipFinalRenderJobPayload {
  projectId: string;
  organizationId: string;
  requestedByUserId: string;
  finalRenderId: string;
}
