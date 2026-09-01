<template>
  <AppLayout>
    <section class="hero-banner studio-hero">
      <div>
        <p class="page-eyebrow">Estudio de clipe infantil</p>
        <h2 class="page-title">{{ project?.title || 'Carregando projeto...' }}</h2>
        <p class="page-subtitle">Crie, envie, compare e aprove a identidade de cada personagem.</p>
      </div>
      <span v-if="project?.childrenClip" class="status-pill">{{ productionStatusLabel }}</span>
    </section>

    <v-alert v-if="errorMessage" class="studio-width" type="error" variant="tonal" closable @click:close="errorMessage = null">{{ errorMessage }}</v-alert>
    <v-alert v-if="navigationFeedback" class="studio-width" type="info" variant="tonal" closable @click:close="navigationFeedback = null">{{ navigationFeedback }}</v-alert>

    <template v-if="project?.childrenClip">
      <section class="studio-width setup-grid">
        <article class="surface-card setup-card">
          <span class="setup-card__icon"><v-icon icon="mdi-music-note" /></span>
          <div><strong>Musica e letra</strong><p>Arquivo recebido e letra original registrada.</p></div>
          <v-icon icon="mdi-check-circle" color="success" />
        </article>
        <article class="surface-card setup-card">
          <span class="setup-card__icon"><v-icon icon="mdi-palette-outline" /></span>
          <div><strong>Direcao visual</strong><p>{{ project.childrenClip.visualStyle }}</p></div>
          <v-icon icon="mdi-check-circle" color="success" />
        </article>
      </section>

      <section class="surface-card studio-width audio-panel">
        <div class="panel-heading">
          <div>
            <p class="page-eyebrow">Etapa 1</p>
            <h3>Analise da musica</h3>
            <p>BPM, batidas, energia, secoes e sincronizacao inicial da letra.</p>
          </div>
          <span v-if="audioStatus?.analysis" class="version-status" :class="`version-status--${audioStatus.analysis.status}`">{{ audioStatusLabel }}</span>
        </div>

        <div v-if="audioStatus?.analysis?.status === 'queued' || audioStatus?.analysis?.status === 'analyzing'" class="audio-progress">
          <v-progress-linear :model-value="audioStatus.job?.progress ?? 0" color="warning" height="9" rounded />
          <div><strong>{{ audioStatus.job?.progress ?? 0 }}%</strong><span>{{ audioStatus.job?.detailMessage || 'Aguardando o worker...' }}</span></div>
        </div>

        <v-alert v-if="audioStatus?.analysis?.status === 'failed'" type="error" variant="tonal">
          {{ audioStatus.analysis.errorMessage || audioStatus.job?.errorMessage || 'Falha ao analisar a musica.' }}
          <template #append><button class="app-button app-button--secondary" type="button" @click="retryAudioAnalysis">Tentar novamente</button></template>
        </v-alert>
        <div v-if="audioStatus?.analysis?.status === 'failed'" class="replace-track">
          <label class="auth-input-group"><span class="auth-input-label">Substituir musica com problema</span><input class="auth-input" type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" @change="onReplacementTrackSelected" /></label>
          <button class="app-button app-button--secondary" type="button" :disabled="!replacementTrack || replacingTrack" @click="replaceTrack">{{ replacingTrack ? 'Enviando...' : 'Enviar outra musica' }}</button>
        </div>

        <template v-if="audioStatus?.analysis?.status === 'completed'">
          <div class="audio-metrics">
            <div><span>Duracao</span><strong>{{ formatTime(audioStatus.analysis.durationSeconds || 0) }}</strong></div>
            <div><span>Ritmo</span><strong>{{ audioStatus.analysis.bpm?.toFixed(1) }} BPM</strong></div>
            <div><span>Compasso</span><strong>{{ audioStatus.analysis.timeSignature }}/4</strong></div>
            <div><span>Batidas</span><strong>{{ audioStatus.analysis.beatGrid?.length || 0 }}</strong></div>
          </div>
          <div v-if="waveformPreview.length" class="waveform" aria-label="Forma de onda simplificada">
            <i v-for="(point, index) in waveformPreview" :key="index" :style="{ height: `${Math.max(4, (point.max - point.min) * 44)}px` }" />
          </div>
          <div class="music-sections">
            <div v-for="section in audioStatus.musicSections" :key="section.id">
              <strong>{{ section.title }}</strong>
              <span>{{ formatTime(section.startSeconds) }} - {{ formatTime(section.endSeconds) }}</span>
              <em :style="{ width: `${Math.round((section.energy || 0) * 100)}%` }" />
            </div>
          </div>
          <details class="lyric-cues">
            <summary>{{ audioStatus.lyricCues.length }} linhas sincronizadas</summary>
            <ol><li v-for="cue in audioStatus.lyricCues" :key="cue.id"><time>{{ formatTime(cue.startSeconds) }}</time><span>{{ cue.text }}</span></li></ol>
          </details>
        </template>
      </section>

      <section class="surface-card studio-width character-panel">
        <div class="panel-heading">
          <div>
            <p class="page-eyebrow">Etapa 2</p>
            <h3>{{ editingCharacterId ? 'Criar nova versao' : 'Adicionar personagem' }}</h3>
            <p>Use uma descricao para gerar no ComfyUI ou envie sua propria imagem.</p>
          </div>
          <button v-if="editingCharacterId" class="app-button app-button--secondary" type="button" @click="resetForm">Cancelar nova versao</button>
        </div>

        <form class="character-form" @submit.prevent="saveCharacter">
          <label v-if="!editingCharacterId" class="auth-input-group"><span class="auth-input-label">Nome</span><input v-model="characterName" class="auth-input" placeholder="Ex.: Bibi, a coelhinha" /></label>
          <label v-if="!editingCharacterId" class="auth-input-group"><span class="auth-input-label">Papel na historia</span><input v-model="roleName" class="auth-input" placeholder="Ex.: Protagonista" /></label>
          <label class="auth-input-group character-form__wide"><span class="auth-input-label">Descricao visual detalhada</span><textarea v-model="characterDescription" class="auth-input auth-input--textarea" rows="5" placeholder="Especie, idade aparente, corpo, rosto, cabelo, roupas, acessorios, personalidade e cores." /></label>
          <label class="auth-input-group character-form__wide"><span class="auth-input-label">Elementos que nunca devem mudar</span><textarea v-model="invariantsText" class="auth-input auth-input--textarea" rows="3" placeholder="Um item por linha. Ex.: vestido amarelo; orelhas rosas; tenis azuis." /></label>
          <label class="auth-input-group"><span class="auth-input-label">Origem desta versao</span><select v-model="sourceMode" class="auth-input"><option value="generated">Gerar pelo sistema</option><option value="uploaded">Enviar minha imagem</option></select></label>
          <label v-if="!editingCharacterId" class="auth-input-group"><span class="auth-input-label">Disponibilidade</span><select v-model="characterScope" class="auth-input"><option value="project">Somente neste projeto</option><option value="organization">Biblioteca da organizacao</option></select></label>
          <label v-if="sourceMode === 'uploaded'" class="auth-input-group character-form__wide"><span class="auth-input-label">Imagem principal</span><input class="auth-input" type="file" accept="image/jpeg,image/png,image/webp" @change="onPrimaryFileSelected" /></label>
          <div class="character-form__wide form-actions"><button class="app-button" type="submit" :disabled="savingCharacter">{{ savingCharacter ? 'Salvando...' : sourceMode === 'generated' ? 'Salvar e gerar ficha' : 'Salvar e enviar imagem' }}</button></div>
        </form>
      </section>

      <section v-if="libraryCharacters.length" class="surface-card studio-width character-panel">
        <div class="panel-heading"><div><p class="page-eyebrow">Biblioteca</p><h3>Reutilizar personagem aprovado</h3><p>Vincule uma identidade já aprovada nesta organização sem gerar imagens novamente.</p></div></div>
        <div class="library-character-form">
          <select v-model="libraryCharacterId" class="auth-input"><option value="">Selecione um personagem</option><option v-for="item in libraryCharacters" :key="item.id" :value="item.id">{{ item.name }} · versão {{ item.versionNumber }}</option></select>
          <input v-model="libraryRoleName" class="auth-input" placeholder="Papel neste clipe (opcional)" />
          <button class="app-button app-button--secondary" type="button" :disabled="!libraryCharacterId || attachingLibraryCharacter" @click="attachLibraryCharacter">{{ attachingLibraryCharacter ? 'Vinculando...' : 'Usar neste clipe' }}</button>
        </div>
      </section>

      <section class="studio-width character-list-section">
        <div class="list-heading"><div><p class="page-eyebrow">Elenco</p><h3>Personagens do clipe</h3></div><span>{{ characters.length }} personagem{{ characters.length === 1 ? '' : 's' }}</span></div>

        <div v-if="characters.length === 0" class="surface-card empty-state"><v-icon icon="mdi-account-multiple-plus-outline" size="44" /><strong>Nenhum personagem cadastrado</strong><p>Adicione o primeiro personagem no formulario acima.</p></div>

        <article v-for="character in characters" :key="character.id" class="surface-card character-card">
          <div class="character-card__heading">
            <div><span class="approval-dot" :class="{ 'approval-dot--approved': character.approvedVersionId }" /><div><h4>{{ character.name }}</h4><p>{{ character.roleName || 'Papel nao informado' }} · {{ character.scope === 'organization' ? 'Biblioteca' : 'Projeto' }}</p></div></div>
            <button class="app-button app-button--secondary" type="button" @click="startNewVersion(character)">Nova versao</button>
          </div>

          <div class="version-list">
            <section v-for="version in character.versions" :key="version.id" class="version-card" :class="{ 'version-card--approved': version.status === 'approved' }">
              <header><div><strong>Versao {{ version.versionNumber }}</strong><span class="version-origin">{{ originLabel(version.origin) }}</span></div><span class="version-status" :class="`version-status--${version.status}`">{{ statusLabel(version.status) }}</span></header>
              <p class="version-description">{{ version.description }}</p>
              <div v-if="version.status === 'queued' || version.status === 'generating'" class="generation-progress"><v-progress-linear indeterminate color="warning" /><span>{{ version.status === 'queued' ? 'Aguardando worker de personagens...' : 'ComfyUI esta gerando a ficha...' }}</span></div>
              <v-alert v-if="version.errorMessage" type="error" variant="tonal">{{ version.errorMessage }}</v-alert>

              <div v-if="version.assets.length" class="asset-grid">
                <figure v-for="asset in version.assets" :key="asset.id">
                  <img v-if="assetUrls[asset.id]" :src="assetUrls[asset.id]" :alt="asset.label || asset.role" />
                  <div v-else-if="asset.status === 'queued' || asset.status === 'generating'" class="asset-loading"><v-progress-circular indeterminate size="26" /></div>
                  <div v-else class="asset-loading"><v-icon icon="mdi-image-off-outline" /></div>
                  <figcaption>{{ asset.label || roleLabel(asset.role) }} · {{ characterAssetStatusLabel(asset.status) }}</figcaption>
                  <v-alert v-if="asset.errorMessage" density="compact" type="error" variant="tonal">{{ asset.errorMessage }}</v-alert>
                  <div class="version-actions"><button v-if="asset.status === 'ready_for_review'" class="app-button app-button--secondary" type="button" @click="approveCharacterAsset(character.id, version.id, asset.id)">Aprovar asset</button><button v-if="asset.status === 'ready_for_review'" class="app-button app-button--secondary" type="button" @click="rejectCharacterAsset(character.id, version.id, asset.id)">Rejeitar</button><button v-if="asset.status === 'failed' && asset.origin === 'generated'" class="app-button app-button--secondary" type="button" @click="retryCharacterAsset(character.id, version.id, asset.id)">Tentar novamente</button></div>
                </figure>
              </div>

              <div class="version-actions">
                <button v-if="version.status === 'failed'" class="app-button" type="button" @click="retryGeneration(character.id, version.id)">Tentar gerar novamente</button>
                <button v-if="version.status === 'ready_for_review'" class="app-button" type="button" @click="approveVersion(character.id, version.id)">Aprovar esta versao</button>
                <button v-if="version.status === 'ready_for_review'" class="app-button app-button--secondary" type="button" @click="rejectVersion(character.id, version.id)">Rejeitar</button>
                <span v-if="version.status === 'approved'" class="approved-copy"><v-icon icon="mdi-lock-check" /> Identidade bloqueada para producao</span>
              </div>

              <details class="supplementary-assets">
                <summary>Adicionar outra pose, expressao ou angulo</summary>
                <div class="supplementary-assets__form">
                  <select v-model="assetRoles[version.id]" class="auth-input"><option value="front_view">Vista frontal</option><option value="side_view">Vista lateral</option><option value="back_view">Vista traseira</option><option value="portrait">Retrato</option><option value="expression">Expressao</option><option value="pose">Pose</option><option value="mouth_shape">Forma de boca</option><option value="eye_state">Estado dos olhos</option><option value="source_reference">Referencia original</option></select>
                  <input v-model="assetLabels[version.id]" class="auth-input" :placeholder="assetRoles[version.id] === 'mouth_shape' ? 'A, E, O, U ou closed' : 'Nome da pose/expressão (opcional)'" />
                  <input class="auth-input" type="file" accept="image/jpeg,image/png,image/webp" @change="onVersionFileSelected(version.id, $event)" />
                  <button v-if="version.status === 'approved' && assetRoles[version.id] !== 'source_reference'" class="app-button app-button--secondary" type="button" :disabled="!(assetLabels[version.id] || '').trim()" @click="generateSupplementary(character.id, version.id)">Gerar com referência</button>
                  <button class="app-button app-button--secondary" type="button" :disabled="!versionFiles[version.id]" @click="uploadSupplementary(character.id, version.id)">Enviar</button>
                </div>
              </details>
            </section>
          </div>
        </article>
      </section>

      <section id="step-3" class="surface-card studio-width plan-panel">
        <div class="panel-heading">
          <div><p class="page-eyebrow">Etapa 3</p><h3>Biblia visual, roteiro e storyboard</h3><p>Planeje todas as tomadas antes de gerar cenarios e animacao.</p></div>
          <span v-if="planStatus?.plan" class="version-status" :class="`version-status--${planStatus.plan.status}`">{{ planStatusLabel }}</span>
        </div>

        <div v-if="planStatus?.blockers.length && !planStatus.plan" class="plan-blockers">
          <strong>Para liberar o planejamento:</strong><ul><li v-for="blocker in planStatus.blockers" :key="blocker">{{ blocker }}</li></ul>
        </div>

        <div v-if="!planStatus?.plan" class="plan-start">
          <button class="app-button" type="button" :disabled="!planStatus?.readyToGenerate" @click="generatePlan">Gerar roteiro e storyboard</button>
        </div>

        <div v-if="planStatus?.plan && ['queued', 'generating'].includes(planStatus.plan.status)" class="audio-progress">
          <v-progress-linear :model-value="planStatus.job?.progress || 0" color="warning" height="9" rounded />
          <div><strong>{{ planStatus.job?.progress || 0 }}%</strong><span>{{ planStatus.job?.detailMessage || 'Preparando planejamento...' }}</span></div>
        </div>

        <v-alert v-if="planStatus?.plan?.status === 'failed'" type="error" variant="tonal">
          {{ planStatus.plan.errorMessage || planStatus.job?.errorMessage }}
          <template #append><button class="app-button app-button--secondary" type="button" @click="generatePlan">Tentar novamente</button></template>
        </v-alert>

        <template v-if="planStatus?.plan && ['ready_for_review', 'approved'].includes(planStatus.plan.status)">
          <div class="plan-json-grid">
            <label class="auth-input-group"><span class="auth-input-label">Biblia visual (JSON editavel)</span><textarea v-model="visualBibleJson" class="auth-input auth-input--textarea code-textarea" rows="12" :disabled="planStatus.plan.status === 'approved'" /></label>
            <label class="auth-input-group"><span class="auth-input-label">Narrativa (JSON editavel)</span><textarea v-model="narrativeJson" class="auth-input auth-input--textarea code-textarea" rows="12" :disabled="planStatus.plan.status === 'approved'" /></label>
          </div>
          <div v-if="planStatus.plan.status !== 'approved'" class="plan-save-area">
            <button class="app-button app-button--secondary" type="button" :disabled="savingPlanText" @click="savePlanText">
              {{ savingPlanText ? 'Salvando...' : 'Salvar biblia e narrativa' }}
            </button>
            <v-alert
              v-if="planSaveFeedback"
              :type="planSaveFeedback.type"
              variant="tonal"
              density="compact"
              closable
              aria-live="polite"
              @click:close="planSaveFeedback = null"
            >
              {{ planSaveFeedback.message }}
            </v-alert>
          </div>

          <div class="timeline-strip">
            <div v-for="shot in planStatus.shots" :key="shot.id" :style="{ width: `${(shot.durationSeconds / Math.max(1, audioStatus?.analysis?.durationSeconds || 1)) * 100}%` }" :title="`${shot.index + 1}. ${shot.title}`"><span>{{ shot.index + 1 }}</span></div>
          </div>

          <div class="shot-list">
            <details v-for="shot in planStatus.shots" :key="shot.id" class="shot-card">
              <summary><span><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ formatTimePrecise(shot.startSeconds) }} - {{ formatTimePrecise(shot.endSeconds) }} · {{ shot.renderMode === 'animation_2d' ? '2D' : shot.renderMode }}</small></span><span>{{ shot.lyricText || 'Instrumental' }}</span></summary>
              <div class="shot-form">
                <label class="auth-input-group"><span class="auth-input-label">Titulo</span><input v-model="shot.title" class="auth-input" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group"><span class="auth-input-label">Modo</span><select v-model="shot.renderMode" class="auth-input" :disabled="planStatus.plan.status === 'approved'"><option value="animation_2d">Animacao 2D</option><option value="wan">Tomada Wan</option><option value="snapgen">SnapGen (Veo 3.1 Fast)</option><option value="hybrid">Hibrida</option></select></label>
                <label class="auth-input-group"><span class="auth-input-label">Inicio (s)</span><input v-model.number="shot.startSeconds" class="auth-input" type="number" min="0" step="0.001" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group"><span class="auth-input-label">Fim (s)</span><input v-model.number="shot.endSeconds" class="auth-input" type="number" min="0.1" step="0.001" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group"><span class="auth-input-label">Enquadramento</span><input v-model="shot.framing" class="auth-input" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group"><span class="auth-input-label">Camera</span><input v-model="shot.cameraMovement" class="auth-input" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group shot-form__wide"><span class="auth-input-label">Acao</span><textarea v-model="shot.characterAction" class="auth-input auth-input--textarea" rows="3" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group shot-form__wide"><span class="auth-input-label">Cenario</span><textarea v-model="shot.environment" class="auth-input auth-input--textarea" rows="2" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group shot-form__wide"><span class="auth-input-label">Prompt do fundo</span><textarea v-model="shot.backgroundPrompt" class="auth-input auth-input--textarea" rows="3" :disabled="planStatus.plan.status === 'approved'" /></label>
                <button v-if="planStatus.plan.status !== 'approved'" class="app-button app-button--secondary" type="button" @click="saveShot(shot)">Salvar tomada</button>
              </div>
            </details>
          </div>

          <div v-if="planStatus.plan.status !== 'approved'" class="plan-final-actions">
            <label class="auth-input-group"><span class="auth-input-label">Instrucao para regenerar o plano inteiro</span><textarea v-model="planRevision" class="auth-input auth-input--textarea" rows="3" placeholder="Ex.: Mais cenas no jardim e menos close-ups." /></label>
            <div><button class="app-button app-button--secondary" type="button" @click="generatePlan">Gerar nova revisao</button><button class="app-button" type="button" @click="approvePlan">Aprovar plano de producao</button></div>
          </div>
          <div v-else class="approved-plan-actions">
            <p class="approved-copy"><v-icon icon="mdi-lock-check" /> Plano aprovado e bloqueado para producao de assets.</p>
            <label class="auth-input-group"><span class="auth-input-label">Criar uma nova revisao</span><textarea v-model="planRevision" class="auth-input auth-input--textarea" rows="2" placeholder="Descreva o que deve mudar no plano aprovado." /></label>
            <button class="app-button app-button--secondary" type="button" :disabled="!planRevision.trim()" @click="generatePlan">Gerar nova revisao</button>
          </div>
        </template>
      </section>

      <section id="step-4" v-if="planStatus?.plan?.status === 'approved'" class="surface-card studio-width plan-panel production-assets-panel">
        <div class="panel-heading">
          <div><p class="page-eyebrow">Etapa 4</p><h3>Cenários e assets das tomadas</h3><p>Cada tomada recebe um cenário limpo e uma prévia completa que usa as referências dos personagens permitidos.</p></div>
          <span v-if="productionAssets" class="version-status" :class="{ 'version-status--approved': productionAssets.summary.readyForAnimation }">{{ productionAssets.summary.approvedBackgrounds }}/{{ productionAssets.summary.totalShots }} cenários · {{ productionAssets.summary.approvedStoryboards }}/{{ productionAssets.summary.requiredStoryboards }} prévias</span>
        </div>
        <v-alert v-if="productionAssets?.styleLock" class="style-lock-card" :type="productionAssets.styleLock.status === 'locked' ? 'success' : 'warning'" variant="tonal">
          <strong>Project Style Lock v{{ productionAssets.styleLock.versionNumber }} · {{ productionAssets.styleLock.status === 'locked' ? 'ATIVO' : 'DESATUALIZADO' }}</strong>
          <div>Baseado em {{ productionAssets.styleLock.styleReferenceAssetIds.length }} asset(s) aprovado(s). Estilo: {{ productionAssets.styleLock.profile.medium || 'Bíblia Visual' }} · detalhe máximo do fundo: {{ productionAssets.styleLock.profile.maxBackgroundDetail || 'definido pelo projeto' }}.</div>
          <div v-if="productionAssets.styleLock.staleReason">{{ productionAssets.styleLock.staleReason }}</div>
          <button v-if="productionAssets.styleLock.status === 'stale'" class="app-button app-button--secondary" type="button" :disabled="refreshingStyleLock" @click="refreshStyleLock">{{ refreshingStyleLock ? 'Atualizando...' : 'Revisar e atualizar Style Lock' }}</button>
        </v-alert>
        <div class="production-assets-actions">
          <button class="app-button app-button--secondary" type="button" :disabled="replanningShots" @click="replanShots">{{ replanningShots ? 'Replanejando...' : 'Replanejar tomadas' }}</button>
          <button class="app-button" type="button" :disabled="generatingBackgrounds" @click="generateMissingBackgrounds">{{ generatingBackgrounds ? 'Enfileirando...' : 'Avançar geração por Location' }}</button>
          <button class="app-button step4-reset-button" type="button" :disabled="resettingStep4" @click="requestStep4Reset">{{ resettingStep4 ? 'Gerando tudo do zero...' : 'Gerar toda a Etapa 4 do zero' }}</button>
          <span v-if="productionAssets?.summary.readyForAnimation" class="approved-copy"><v-icon icon="mdi-check-decagram" /> Assets mínimos prontos para animação</span>
        </div>
        <v-alert v-if="step4Feedback" :type="step4Feedback.type" variant="tonal" density="compact" closable aria-live="polite" @click:close="step4Feedback = null">{{ step4Feedback.message }}</v-alert>

        <div v-if="productionAssets" class="production-location-list">
          <section v-for="location in productionAssets.locations" :key="location.id" class="production-location-card">
            <header class="location-heading">
              <div><span class="location-kicker">Location</span><h4>{{ location.name }}</h4><p>{{ location.description }}</p></div>
              <div class="location-heading__status"><span class="version-status" :class="{ 'version-status--approved': location.phase === 'complete' }">{{ locationPhaseLabel(location.phase) }}</span><small>{{ location.approvedShots }}/{{ location.shots.length }} vistas aprovadas</small></div>
            </header>
            <div class="location-master" :class="{ 'location-master--approved': location.master }">
              <button v-if="location.master && shotAssetUrls[location.master.shotAssetId]" class="asset-preview-trigger location-master__preview" type="button" :aria-label="`Ampliar master de ${location.name}`" @click="openImagePreview(location.master.shotAssetId, `Master de ${location.name}`)">
                <img :src="shotAssetUrls[location.master.shotAssetId]" :alt="`Master de ${location.name}`" />
                <span><v-icon icon="mdi-magnify-plus-outline" /> Ampliar</span>
              </button>
              <div v-else class="location-master__placeholder"><v-icon icon="mdi-image-filter-center-focus-strong-outline" size="34" /></div>
              <div>
                <span class="location-kicker">Shot Background Anchor</span>
                <strong v-if="location.master">Master: {{ location.name }} v{{ location.master.versionNumber }} — Aprovada</strong>
                <strong v-else>Master pendente · Tomada {{ shotNumber(location.anchorShotId) }}</strong>
                <p v-if="location.master">As outras vistas herdam arquitetura, paleta, iluminação e perspectiva deste asset.</p>
                <p v-else>Gere e aprove esta vista primeiro. As demais tomadas permanecem bloqueadas até existir uma âncora visual.</p>
              </div>
              <button v-if="['needs_master', 'ready_for_variants'].includes(location.phase)" class="app-button app-button--secondary" type="button" :disabled="generatingLocations[location.id]" @click="generateLocationBackgrounds(location.id)">{{ generatingLocations[location.id] ? 'Enfileirando...' : location.master ? 'Gerar variações pendentes' : 'Gerar master' }}</button>
            </div>
            <div class="location-shot-list">
          <article v-for="shot in shotsForLocation(location)" :key="shot.id" class="shot-asset-card" :class="{ 'shot-asset-card--anchor': location.anchorShotId === shot.id }">
            <header><div><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ shot.musicSection?.title || 'Seção' }} · {{ formatTimePrecise(shot.startSeconds) }} - {{ formatTimePrecise(shot.endSeconds) }}</small></div><span>{{ shot.assets.length }} versão(ões)</span></header>
            <div class="shot-plan-summary">
              <p><strong>Letra:</strong> {{ shot.lyricText || 'Trecho instrumental' }}</p>
              <p><strong>Descrição visual:</strong> {{ shot.description }}</p>
              <p><strong>Local:</strong> {{ shot.location?.name || shot.environment }}<span v-if="shot.timeOfDay"> · {{ shot.timeOfDay }}</span></p>
              <p v-if="shot.location?.masterBackgroundAssetId"><strong>Coerência do local:</strong> cenário mestre aprovado e bloqueado</p>
              <p><strong>Composição:</strong> {{ shot.backgroundSafeZones?.length || 0 }} zona(s) segura(s) · chão/perspectiva {{ shot.groundingRules ? 'definidos' : 'pendentes' }}</p>
              <p><strong>Foco:</strong> {{ shot.primaryFocus || 'Ambiente' }}</p>
              <p><strong>Permitidos:</strong> {{ entityNames(shot.characterVersionIds) || 'Nenhuma entidade cadastrada' }}</p>
              <p><strong>Proibidos:</strong> {{ entityNames(shot.forbiddenEntityVersionIds) || 'Nenhum' }}</p>
            </div>
            <div v-if="shot.assets.length" class="shot-assets-grid">
              <figure v-for="asset in shot.assets" :key="asset.id" :class="{ 'shot-asset--approved': asset.status === 'approved' }">
                <button v-if="shotAssetUrls[asset.id]" class="asset-preview-trigger" type="button" :aria-label="`Ampliar ${asset.label || shotAssetRoleLabel(asset.role)}`" @click="openImagePreview(asset.id, `${shot.index + 1}. ${shot.title} — ${shotAssetRoleLabel(asset.role)} v${asset.versionNumber}`)">
                  <img :src="shotAssetUrls[asset.id]" :alt="asset.label || asset.role" />
                  <span><v-icon icon="mdi-magnify-plus-outline" /> Ampliar</span>
                </button>
                <div v-else-if="asset.status === 'queued' || asset.status === 'generating'" class="asset-loading"><v-progress-circular indeterminate size="28" /></div>
                <div v-else class="asset-loading"><v-icon icon="mdi-image-off-outline" /></div>
                <figcaption><strong>{{ shotAssetRoleLabel(asset.role) }} · v{{ asset.versionNumber }}</strong><span class="version-status" :class="`version-status--${asset.status}`">{{ shotAssetStatusLabel(asset.status) }}</span></figcaption>
                <div v-if="asset.status === 'queued' || asset.status === 'generating'" class="asset-job-progress"><v-progress-linear :model-value="asset.job?.progress || 0" color="warning" /><small>{{ asset.job?.detailMessage || 'Aguardando worker...' }} ({{ asset.job?.progress || 0 }}%)</small></div>
                <v-alert v-if="asset.errorMessage || asset.job?.errorMessage" density="compact" type="error" variant="tonal">{{ asset.errorMessage || asset.job?.errorMessage }}</v-alert>
                <v-alert v-if="asset.reviewReason" density="compact" type="warning" variant="tonal">{{ asset.reviewReason }}</v-alert>
                <v-alert v-if="asset.role === 'background' && !asset.styleCompatible" density="compact" type="warning" variant="tonal">Esta versão é anterior ao Style Lock atual. Gere ou envie uma nova versão e aprove-a para liberar a animação.</v-alert>
                <div class="version-actions"><button v-if="asset.status === 'ready_for_review'" class="app-button" type="button" @click="approveShotAsset(asset.id)">Aprovar</button><button v-if="asset.status === 'ready_for_review'" class="app-button app-button--secondary" type="button" @click="rejectShotAsset(asset.id)">Rejeitar</button><button v-if="asset.status === 'failed'" class="app-button app-button--secondary" type="button" @click="retryShotAsset(asset.id)">Tentar novamente</button><span v-if="asset.status === 'approved'" class="approved-copy"><v-icon icon="mdi-lock-check" /> Aprovado</span></div>
              </figure>
            </div>
            <details class="supplementary-assets"><summary>Gerar nova versão ou enviar asset</summary><div class="shot-asset-form">
              <select v-model="shotAssetRoles[shot.id]" class="auth-input"><option value="background">Fundo</option><option value="foreground">Primeiro plano</option><option value="prop">Objeto</option><option value="storyboard_frame">Quadro de storyboard</option><option value="character_pose">Pose de personagem (somente upload)</option></select>
              <select v-if="shotAssetRoles[shot.id] === 'character_pose'" v-model="shotPoseCharacterVersions[shot.id]" class="auth-input"><option value="">Selecione o personagem da pose</option><option v-for="character in charactersForShot(shot)" :key="character.id" :value="character.selectedVersionId || ''">{{ character.name }}</option></select>
              <textarea v-model="shotAssetPrompts[shot.id]" class="auth-input auth-input--textarea" rows="2" :placeholder="shot.backgroundPrompt" />
              <button v-if="shotAssetRoles[shot.id] !== 'character_pose'" class="app-button app-button--secondary" type="button" :disabled="shotAssetRoles[shot.id] === 'background' && !canCreateBackground(shot.id)" @click="generateShotAsset(shot.id)">Gerar versão</button>
              <input class="auth-input" type="file" accept="image/jpeg,image/png,image/webp" @change="onShotAssetFileSelected(shot.id, $event)" />
              <button class="app-button app-button--secondary" type="button" :disabled="!shotAssetFiles[shot.id] || (shotAssetRoles[shot.id] === 'background' && !canCreateBackground(shot.id))" @click="uploadShotAsset(shot.id)">Enviar imagem</button>
            </div></details>
          </article>
            </div>
          </section>
        </div>
      </section>

      <section v-if="productionAssets?.summary.readyForAnimation" class="surface-card studio-width plan-panel animation-panel">
        <div class="panel-heading">
          <div><p class="page-eyebrow">Etapa 5</p><h3>Animacao 2D e lip sync</h3><p>Render deterministico com camera, parallax, pulsos musicais, legenda e formas de boca sincronizadas.</p></div>
          <span v-if="animationStatus" class="version-status" :class="{ 'version-status--approved': animationStatus.summary.completed2dShots === animationStatus.summary.total2dShots }">{{ animationStatus.summary.completed2dShots }}/{{ animationStatus.summary.total2dShots }} tomadas 2D</span>
        </div>
        <div class="production-assets-actions"><button class="app-button" type="button" :disabled="renderingMissingShots" @click="renderMissingShots">{{ renderingMissingShots ? 'Enfileirando...' : 'Renderizar tomadas 2D pendentes' }}</button></div>
        <div v-if="animationStatus" class="animation-shot-list">
          <article v-for="shot in animationStatus.shots" :key="shot.id" class="animation-shot-card">
            <header><div><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ shot.renderMode === 'hybrid' ? '2D + tomada especial' : shot.renderMode === 'wan' ? 'Tomada especial Wan' : shot.renderMode === 'snapgen' ? 'Tomada especial SnapGen' : 'Animacao 2D' }}</small></div><span v-if="shot.latestAttempt" class="version-status" :class="`version-status--${shot.latestAttempt.status}`">{{ renderStatusLabel(shot.latestAttempt.status) }}</span></header>
            <template v-if="shot.renderMode !== 'wan'">
              <video v-if="shot.latestAttempt?.hasVideo && renderUrls[shot.latestAttempt.id]" class="shot-render-preview" controls preload="metadata" :src="renderUrls[shot.latestAttempt.id]" />
              <div v-if="shot.latestAttempt && ['queued', 'rendering'].includes(shot.latestAttempt.status)" class="asset-job-progress"><v-progress-linear :model-value="shot.latestAttempt.progress" color="warning" /><small>{{ shot.latestAttempt.stage || 'QUEUED' }} · {{ shot.latestAttempt.progress }}%</small></div>
              <v-alert v-if="shot.latestAttempt?.status === 'failed'" density="compact" type="error" variant="tonal">{{ shot.latestAttempt.errorMessage || 'Falha no render 2D.' }}</v-alert>
              <div class="version-actions"><button v-if="!shot.latestAttempt" class="app-button app-button--secondary" type="button" :disabled="!shot.hasApprovedBackground || !shot.hasApprovedStoryboard" @click="renderShot(shot.id)">Renderizar tomada</button><button v-if="shot.latestAttempt?.status === 'failed'" class="app-button app-button--secondary" type="button" @click="retryShotRender(shot.latestAttempt.id)">Tentar novamente</button><button v-if="shot.latestAttempt?.status === 'completed'" class="app-button app-button--secondary" type="button" @click="renderShot(shot.id)">Nova versao</button></div>
              <details v-if="shot.latestAttempt?.renderManifest"><summary>Manifesto reproduzivel</summary><pre class="render-manifest">{{ JSON.stringify(shot.latestAttempt.renderManifest, null, 2) }}</pre></details>
            </template>
          </article>
        </div>
      </section>

      <section v-if="productionAssets?.summary.readyForAnimation" class="surface-card studio-width plan-panel output-panel">
        <div class="panel-heading"><div><p class="page-eyebrow">Etapas 6 a 9</p><h3>Tomadas especiais e clipe final</h3><p>Escolha entre ComfyUI/Wan local e Veo 3.1 Fast pela SnapGen. O render final normaliza todas as fontes e aplica a musica original.</p></div></div>
        <div v-if="outputStatus?.heroShots.length" class="hero-shot-list">
          <article v-for="shot in outputStatus.heroShots" :key="shot.id" class="animation-shot-card">
            <header><div><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ ['wan', 'snapgen'].includes(shot.renderMode) ? 'IA generativa obrigatoria para esta tomada' : 'IA generativa opcional; a base 2D continua valida' }}</small></div><span v-if="shot.latestAttempt" class="version-status" :class="`version-status--${shot.latestAttempt.status}`">{{ shot.latestAttempt.status }}</span></header>
            <video v-if="shot.latestAttempt?.assetId && heroUrls[shot.latestAttempt.id]" class="shot-render-preview" controls preload="metadata" :src="heroUrls[shot.latestAttempt.id]" />
            <div v-if="shot.latestAttempt && ['queued', 'generating', 'validating'].includes(shot.latestAttempt.status)" class="asset-job-progress"><v-progress-linear :model-value="shot.latestAttempt.progress" color="warning" /><small>{{ shot.latestAttempt.stage }} · {{ shot.latestAttempt.progress }}%</small></div>
            <v-alert v-if="shot.latestAttempt?.status === 'failed'" type="error" variant="tonal" density="compact">{{ shot.latestAttempt.errorMessage }}</v-alert>
            <div v-if="shot.latestAttempt" class="attempt-facts"><span><strong>Provider:</strong> {{ shot.latestAttempt.provider === 'snapgen' ? 'SnapGen' : 'ComfyUI / Wan' }}</span><span><strong>Attempt:</strong> {{ shot.latestAttempt.attemptNumber }}</span><span v-if="attemptRequest(shot.latestAttempt).model"><strong>Modelo:</strong> {{ attemptRequest(shot.latestAttempt).model }}</span><span v-if="attemptRequest(shot.latestAttempt).resolution"><strong>Resolucao:</strong> {{ attemptRequest(shot.latestAttempt).resolution }}</span><span v-if="attemptRequest(shot.latestAttempt).referenceMode"><strong>Referencias:</strong> {{ attemptRequest(shot.latestAttempt).referenceMode }}</span><span v-if="attemptMetric(shot.latestAttempt, 'estimatedCredit') != null"><strong>Custo estimado:</strong> {{ attemptMetric(shot.latestAttempt, 'estimatedCredit') }} creditos</span><span v-if="attemptMetric(shot.latestAttempt, 'usedCredit') != null"><strong>Custo real:</strong> {{ attemptMetric(shot.latestAttempt, 'usedCredit') }} creditos</span><span v-if="shot.latestAttempt.durationMs"><strong>Tempo:</strong> {{ Math.round(shot.latestAttempt.durationMs / 1000) }}s</span></div>
            <details v-if="!shot.latestAttempt || !['queued', 'generating', 'validating'].includes(shot.latestAttempt.status)" class="video-provider-panel" open>
              <summary>Configurar geracao de video</summary>
              <div class="provider-options">
                <label :class="{ selected: heroConfig(shot.id).provider === 'local' }"><input v-model="heroConfig(shot.id).provider" type="radio" value="local" /> Local — ComfyUI / Wan</label>
                <label :class="{ selected: heroConfig(shot.id).provider === 'snapgen' }"><input v-model="heroConfig(shot.id).provider" type="radio" value="snapgen" /> Nuvem — SnapGen / Veo 3.1 Fast</label>
              </div>
              <v-alert v-if="heroConfig(shot.id).provider === 'snapgen' && !outputStatus.snapgen.configured" density="compact" type="warning" variant="tonal">Configure SNAPGEN_API_KEY no servidor para habilitar este provider.</v-alert>
              <div v-if="heroConfig(shot.id).provider === 'snapgen'" class="provider-fields">
                <label>Modelo<select v-model="heroConfig(shot.id).model"><option value="veo-3.1-fast">Veo 3.1 Fast</option></select></label>
                <label>Resolucao<select v-model="heroConfig(shot.id).resolution"><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
                <label>Duracao<input value="8 segundos (fixa)" disabled /></label>
                <label>Uso das imagens<select v-model="heroConfig(shot.id).referenceMode"><option value="frame">First / Last Frame</option><option value="ingredient">Ingredient Images (1 a 3)</option></select></label>
              </div>
              <div v-if="heroConfig(shot.id).referenceMode !== 'ingredient' || heroConfig(shot.id).provider === 'local'" class="provider-fields">
                <label>First Image<select v-model="heroConfig(shot.id).firstImageAssetId"><option value="">Selecione</option><option v-for="reference in outputStatus.availableReferences" :key="reference.id" :value="reference.id">{{ reference.name }}</option></select></label>
                <label v-if="heroConfig(shot.id).provider === 'snapgen'">Last Image (opcional)<select v-model="heroConfig(shot.id).lastImageAssetId"><option value="">Nenhuma</option><option v-for="reference in outputStatus.availableReferences" :key="reference.id" :value="reference.id">{{ reference.name }}</option></select></label>
              </div>
              <div v-else class="reference-picker"><strong>Ingredient Images — selecione de 1 a 3</strong><div class="reference-grid"><button v-for="reference in outputStatus.availableReferences" :key="reference.id" type="button" :class="{ selected: isIngredientSelected(shot.id, reference.id) }" @click="toggleIngredient(shot.id, reference.id)"><img v-if="referenceUrls[reference.id]" :src="referenceUrls[reference.id]" :alt="reference.name" /><span>{{ reference.name }}</span></button></div></div>
              <label class="provider-prompt">Prompt de movimento<textarea v-model="heroConfig(shot.id).prompt" rows="5" maxlength="6000" placeholder="Deixe vazio para usar o prompt automatico da tomada." /></label>
            </details>
            <div class="version-actions"><button v-if="!shot.latestAttempt || ['ready_for_review', 'approved', 'rejected'].includes(shot.latestAttempt.status)" class="app-button app-button--secondary" type="button" :disabled="heroConfig(shot.id).provider === 'snapgen' && !outputStatus.snapgen.configured" @click="generateHeroShot(shot.id)">{{ shot.latestAttempt ? 'Gerar outra versao' : 'Gerar tomada especial' }}</button><button v-if="shot.latestAttempt?.status === 'ready_for_review'" class="app-button" type="button" @click="approveHeroShot(shot.latestAttempt.id)">Aprovar</button><button v-if="shot.latestAttempt?.status === 'ready_for_review'" class="app-button app-button--secondary" type="button" @click="rejectHeroShot(shot.latestAttempt.id)">Rejeitar</button><button v-if="shot.latestAttempt?.status === 'failed'" class="app-button app-button--secondary" type="button" @click="retryHeroShot(shot.latestAttempt.id, shot.id)">Tentar novamente</button><span v-if="shot.latestAttempt?.status === 'approved'" class="approved-copy"><v-icon icon="mdi-lock-check" /> Aprovado</span></div>
            <details v-if="shot.latestAttempt?.generationManifest"><summary>Manifesto da tentativa</summary><pre class="render-manifest">{{ JSON.stringify(shot.latestAttempt.generationManifest, null, 2) }}</pre></details>
          </article>
        </div>
        <div v-if="outputStatus" class="final-render-card">
          <div v-if="outputStatus.blockers.length" class="plan-blockers"><strong>Antes do render final:</strong><ul><li v-for="blocker in outputStatus.blockers" :key="blocker">{{ blocker }}</li></ul></div>
          <button v-if="!outputStatus.finalRender || ['completed', 'failed'].includes(outputStatus.finalRender.status)" class="app-button" type="button" :disabled="!outputStatus.readyForFinal" @click="renderFinalClip">{{ outputStatus.finalRender?.status === 'completed' ? 'Gerar nova versao final' : 'Renderizar clipe final' }}</button>
          <div v-if="outputStatus.finalRender && ['queued', 'compositing', 'encoding', 'validating'].includes(outputStatus.finalRender.status)" class="audio-progress"><v-progress-linear :model-value="outputStatus.finalRender.progress" color="warning" height="9" rounded /><div><strong>{{ outputStatus.finalRender.progress }}%</strong><span>{{ outputStatus.finalRender.stage }}</span></div></div>
          <v-alert v-if="outputStatus.finalRender?.status === 'failed'" type="error" variant="tonal">{{ outputStatus.finalRender.errorMessage }}<template #append><button class="app-button app-button--secondary" type="button" @click="retryFinalClip(outputStatus.finalRender.id)">Tentar novamente</button></template></v-alert>
          <template v-if="outputStatus.finalRender?.hasVideo && finalRenderUrl"><video class="final-render-preview" controls preload="metadata" :src="finalRenderUrl" /><a class="app-button final-download" :href="finalRenderUrl" :download="`clipe-infantil-v${outputStatus.finalRender.versionNumber}.mp4`">Baixar MP4 final</a><details v-if="outputStatus.finalRender.renderManifest"><summary>Manifesto final</summary><pre class="render-manifest">{{ JSON.stringify(outputStatus.finalRender.renderManifest, null, 2) }}</pre></details></template>
        </div>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="previewImageUrl" class="asset-lightbox" role="dialog" aria-modal="true" :aria-label="previewImageTitle" @click.self="closeImagePreview">
        <section class="asset-lightbox__panel">
          <header><strong>{{ previewImageTitle }}</strong><button class="asset-preview-close" type="button" aria-label="Fechar imagem ampliada" @click="closeImagePreview"><v-icon icon="mdi-close" /></button></header>
          <div class="asset-lightbox__image"><img :src="previewImageUrl" :alt="previewImageTitle" /></div>
          <footer><span>Use Esc ou clique fora da imagem para fechar.</span><button class="app-button app-button--secondary" type="button" @click="closeImagePreview">Fechar</button></footer>
        </section>
      </div>
    </Teleport>

    <v-snackbar v-model="step4FeedbackVisible" :color="step4Feedback?.type === 'error' ? 'error' : 'success'" location="top right" :timeout="9000" multi-line>
      {{ step4Feedback?.message }}
      <template #actions><v-btn variant="text" @click="step4FeedbackVisible = false">Fechar</v-btn></template>
    </v-snackbar>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';
import AppLayout from '@/layouts/AppLayout.vue';
import { projectsService } from '@/services/projects.service';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';
import type { CharacterAssetRole, ChildrenClipAnimationStatus, ChildrenClipAudioStatus, ChildrenClipCharacter, ChildrenClipCharacterVersion, ChildrenClipLibraryCharacter, ChildrenClipOutputStatus, ChildrenClipPlanStatus, ChildrenClipProductionAssetsStatus, ChildrenClipProductionLocation, ChildrenClipShot, ChildrenClipShotAsset, ChildrenClipShotAssetRole, ChildrenClipShotRenderAttempt, ChildrenClipVideoGenerationRequest } from '@/types/project.types';

@Component({ components: { AppLayout } })
export default class ChildrenClipStudioPage extends Vue {
  characters: ChildrenClipCharacter[] = [];
  libraryCharacters: ChildrenClipLibraryCharacter[] = [];
  libraryCharacterId = '';
  libraryRoleName = '';
  attachingLibraryCharacter = false;
  audioStatus: ChildrenClipAudioStatus | null = null;
  planStatus: ChildrenClipPlanStatus | null = null;
  productionAssets: ChildrenClipProductionAssetsStatus | null = null;
  refreshingStyleLock = false;
  animationStatus: ChildrenClipAnimationStatus | null = null;
  outputStatus: ChildrenClipOutputStatus | null = null;
  visualBibleJson = '';
  narrativeJson = '';
  savingPlanText = false;
  planSaveFeedback: { type: 'success' | 'error'; message: string } | null = null;
  planRevision = '';
  characterName = '';
  roleName = '';
  characterDescription = '';
  invariantsText = '';
  sourceMode: 'generated' | 'uploaded' = 'generated';
  characterScope: 'project' | 'organization' = 'project';
  primaryFile: File | null = null;
  editingCharacterId: string | null = null;
  savingCharacter = false;
  errorMessage: string | null = null;
  navigationFeedback: string | null = null;
  assetUrls: Record<string, string> = {};
  assetRoles: Record<string, CharacterAssetRole> = {};
  assetLabels: Record<string, string> = {};
  versionFiles: Record<string, File | null> = {};
  pollTimer: ReturnType<typeof setInterval> | null = null;
  replacementTrack: File | null = null;
  replacingTrack = false;
  generatingBackgrounds = false;
  resettingStep4 = false;
  step4Feedback: { type: 'success' | 'error'; message: string } | null = null;
  step4FeedbackVisible = false;
  generatingLocations: Record<string, boolean> = {};
  replanningShots = false;
  shotAssetUrls: Record<string, string> = {};
  previewImageUrl: string | null = null;
  previewImageTitle = '';
  shotAssetRoles: Record<string, ChildrenClipShotAssetRole> = {};
  shotAssetPrompts: Record<string, string> = {};
  shotAssetFiles: Record<string, File | null> = {};
  shotPoseCharacterVersions: Record<string, string> = {};
  renderingMissingShots = false;
  renderUrls: Record<string, string> = {};
  heroUrls: Record<string, string> = {};
  referenceUrls: Record<string, string> = {};
  heroConfigs: Record<string, ChildrenClipVideoGenerationRequest> = {};
  finalRenderUrl: string | null = null;

  get authStore(): any { return useAuthStore(); }
  get projectsStore(): any { return useProjectsStore(); }
  get project() { return this.projectsStore.currentProject; }
  get projectId() { return String(this.$route.params.id); }
  get productionStatusLabel() { return ({ setup: 'Preparacao', analyzing_audio: 'Analisando musica', designing_characters: 'Personagens', failed: 'Requer atencao' } as Record<string, string>)[this.project?.childrenClip?.productionStatus || 'setup'] || this.project?.childrenClip?.productionStatus; }
  get invariants() { return this.invariantsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
  get audioStatusLabel() { return ({ queued: 'Enfileirada', analyzing: 'Analisando', completed: 'Concluida', failed: 'Falhou' } as Record<string, string>)[this.audioStatus?.analysis?.status || 'queued']; }
  get waveformPreview() { return (this.audioStatus?.analysis?.waveform || []).filter((_, index) => index % 5 === 0); }
  get planStatusLabel() { return ({ draft: 'Rascunho', queued: 'Enfileirado', generating: 'Gerando', ready_for_review: 'Revisar', approved: 'Aprovado', failed: 'Falhou' } as Record<string, string>)[this.planStatus?.plan?.status || 'draft']; }

  async mounted() {
    window.addEventListener('keydown', this.onPreviewKeydown);
    if (!this.authStore.token) return;
    try {
      const project = await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      if (project.generationMode !== 'children_clip') { void this.$router.replace({ name: 'project-detail', params: { id: project.id } }); return; }
      await Promise.all([this.loadAudioAnalysis(), this.loadCharacters(), this.loadPlan()]);
      if (this.planStatus?.plan?.status === 'approved') {
        await this.loadProductionAssets();
        if (this.productionAssets?.summary.readyForAnimation) await Promise.all([this.loadAnimation(), this.loadOutput()]);
      }
      await this.scrollToRequestedStep();
      this.pollTimer = setInterval(() => void this.pollIfNeeded(), 4000);
    } catch (error) { this.captureError(error, 'Falha ao carregar o estudio'); }
  }

  beforeUnmount() {
    window.removeEventListener('keydown', this.onPreviewKeydown);
    if (this.pollTimer) clearInterval(this.pollTimer);
    Object.values(this.assetUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.shotAssetUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.renderUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.heroUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.referenceUrls).forEach((url) => URL.revokeObjectURL(url));
    if (this.finalRenderUrl) URL.revokeObjectURL(this.finalRenderUrl);
  }

  async scrollToRequestedStep() {
    if (this.$route.hash !== '#step-4') return;
    await this.$nextTick();
    const step4 = document.getElementById('step-4');
    if (!step4) {
      this.navigationFeedback = 'A Etapa 4 sera liberada assim que voce aprovar o plano de producao na Etapa 3. Revise as tomadas e clique em Aprovar plano de producao.';
      await this.$nextTick();
    }
    const target = step4 ?? document.getElementById('step-3');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async loadCharacters() {
    if (!this.authStore.token) return;
    [this.characters, this.libraryCharacters] = await Promise.all([
      projectsService.listChildrenClipCharacters(this.projectId, this.authStore.token),
      projectsService.listChildrenClipCharacterLibrary(this.projectId, this.authStore.token)
    ]);
    await this.loadAssetUrls();
  }

  async loadAudioAnalysis() {
    if (!this.authStore.token) return;
    this.audioStatus = await projectsService.getChildrenClipAudioAnalysis(this.projectId, this.authStore.token);
  }

  async loadPlan() {
    if (!this.authStore.token) return;
    this.planStatus = await projectsService.getChildrenClipProductionPlan(this.projectId, this.authStore.token);
    if (this.planStatus.plan && !this.visualBibleJson) this.visualBibleJson = JSON.stringify(this.planStatus.plan.visualBible || {}, null, 2);
    if (this.planStatus.plan && !this.narrativeJson) this.narrativeJson = JSON.stringify(this.planStatus.plan.narrative || {}, null, 2);
  }

  async loadProductionAssets() {
    if (!this.authStore.token) return;
    this.productionAssets = await projectsService.getChildrenClipProductionAssets(this.projectId, this.authStore.token);
    for (const shot of this.productionAssets.shots) {
      if (!this.shotAssetRoles[shot.id]) this.shotAssetRoles = { ...this.shotAssetRoles, [shot.id]: 'background' };
    }
    await this.loadShotAssetUrls();
  }

  async loadAnimation() {
    if (!this.authStore.token) return;
    this.animationStatus = await projectsService.getChildrenClipAnimation(this.projectId, this.authStore.token);
    for (const shot of this.animationStatus.shots) {
      const attempt = shot.latestAttempt;
      if (!attempt?.hasVideo || this.renderUrls[attempt.id]) continue;
      const blob = await projectsService.downloadChildrenClipShotRender(this.projectId, attempt.id, this.authStore.token);
      this.renderUrls = { ...this.renderUrls, [attempt.id]: URL.createObjectURL(blob) };
    }
  }

  async loadOutput() {
    if (!this.authStore.token) return;
    this.outputStatus = await projectsService.getChildrenClipOutput(this.projectId, this.authStore.token);
    for (const shot of this.outputStatus.heroShots) {
      if (!this.heroConfigs[shot.id]) this.heroConfigs = { ...this.heroConfigs, [shot.id]: { provider: shot.videoGenerationConfig?.provider ?? (shot.renderMode === 'snapgen' ? 'snapgen' : 'local'), model: 'veo-3.1-fast', resolution: shot.videoGenerationConfig?.resolution ?? '720p', referenceMode: shot.videoGenerationConfig?.referenceMode ?? 'frame', firstImageAssetId: shot.videoGenerationConfig?.firstImageAssetId ?? shot.approvedStoryboardAssetId ?? '', lastImageAssetId: shot.videoGenerationConfig?.lastImageAssetId ?? '', ingredientAssetIds: shot.videoGenerationConfig?.ingredientAssetIds ?? [], prompt: shot.videoGenerationConfig?.prompt ?? shot.automaticPrompt } };
      const attempt = shot.latestAttempt;
      if (!attempt?.assetId || this.heroUrls[attempt.id]) continue;
      const blob = await projectsService.downloadChildrenClipHeroShot(this.projectId, attempt.id, this.authStore.token);
      this.heroUrls = { ...this.heroUrls, [attempt.id]: URL.createObjectURL(blob) };
    }
    for (const reference of this.outputStatus.availableReferences) {
      if (this.referenceUrls[reference.id]) continue;
      const blob = await projectsService.downloadChildrenClipVideoReference(this.projectId, reference.id, this.authStore.token);
      this.referenceUrls = { ...this.referenceUrls, [reference.id]: URL.createObjectURL(blob) };
    }
    if (this.outputStatus.finalRender?.hasVideo && !this.finalRenderUrl) {
      const blob = await projectsService.downloadChildrenClipFinal(this.projectId, this.outputStatus.finalRender.id, this.authStore.token);
      this.finalRenderUrl = URL.createObjectURL(blob);
    }
  }

  async pollIfNeeded() {
    if (this.audioStatus?.analysis && ['queued', 'analyzing'].includes(this.audioStatus.analysis.status)) {
      try {
        await this.loadAudioAnalysis();
        if (this.audioStatus?.analysis?.status === 'completed') await Promise.all([this.projectsStore.fetchProject(this.projectId, this.authStore.token), this.loadPlan()]);
      } catch (error) { this.captureError(error, 'Falha ao atualizar analise da musica'); }
    }
    if (this.characters.some((item) => item.versions.some((version) => ['queued', 'generating'].includes(version.status) || version.assets.some((asset) => ['queued', 'generating'].includes(asset.status))))) {
      try { await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao atualizar personagens'); }
    }
    if (this.planStatus?.plan && ['queued', 'generating'].includes(this.planStatus.plan.status)) {
      try {
        const previousStatus = this.planStatus.plan.status;
        await this.loadPlan();
        if (previousStatus !== this.planStatus?.plan?.status && this.planStatus?.plan?.status === 'ready_for_review') {
          this.visualBibleJson = JSON.stringify(this.planStatus.plan.visualBible || {}, null, 2);
          this.narrativeJson = JSON.stringify(this.planStatus.plan.narrative || {}, null, 2);
        }
      } catch (error) { this.captureError(error, 'Falha ao atualizar planejamento'); }
    }
    if (this.productionAssets?.shots.some((shot) => shot.assets.some((asset) => ['queued', 'generating'].includes(asset.status)))) {
      try { await this.loadProductionAssets(); } catch (error) { this.captureError(error, 'Falha ao atualizar assets das tomadas'); }
    }
    if (this.animationStatus?.shots.some((shot) => shot.latestAttempt && ['queued', 'rendering'].includes(shot.latestAttempt.status))) {
      try { await this.loadAnimation(); } catch (error) { this.captureError(error, 'Falha ao atualizar renders 2D'); }
    }
    if (this.outputStatus?.heroShots.some((shot) => shot.latestAttempt && ['queued', 'generating', 'validating'].includes(shot.latestAttempt.status)) || (this.outputStatus?.finalRender && ['queued', 'compositing', 'encoding', 'validating'].includes(this.outputStatus.finalRender.status))) {
      try { await this.loadOutput(); } catch (error) { this.captureError(error, 'Falha ao atualizar saida final'); }
    }
  }

  async loadAssetUrls() {
    if (!this.authStore.token) return;
    for (const character of this.characters) for (const version of character.versions) for (const asset of version.assets) {
      if (!asset.assetId || this.assetUrls[asset.id]) continue;
      const blob = await projectsService.downloadChildrenClipCharacterAsset(this.projectId, character.id, version.id, asset.id, this.authStore.token);
      this.assetUrls = { ...this.assetUrls, [asset.id]: URL.createObjectURL(blob) };
    }
  }

  async loadShotAssetUrls() {
    if (!this.authStore.token || !this.productionAssets) return;
    for (const shot of this.productionAssets.shots) for (const asset of shot.assets) {
      if (!asset.asset || this.shotAssetUrls[asset.id]) continue;
      const blob = await projectsService.downloadChildrenClipShotAsset(this.projectId, asset.id, this.authStore.token);
      this.shotAssetUrls = { ...this.shotAssetUrls, [asset.id]: URL.createObjectURL(blob) };
    }
  }

  onPrimaryFileSelected(event: Event) { this.primaryFile = (event.target as HTMLInputElement).files?.[0] ?? null; }
  onReplacementTrackSelected(event: Event) { this.replacementTrack = (event.target as HTMLInputElement).files?.[0] ?? null; }
  onVersionFileSelected(versionId: string, event: Event) {
    this.versionFiles = { ...this.versionFiles, [versionId]: (event.target as HTMLInputElement).files?.[0] ?? null };
    if (!this.assetRoles[versionId]) this.assetRoles = { ...this.assetRoles, [versionId]: 'pose' };
  }

  async saveCharacter() {
    if (!this.authStore.token) return;
    const name = this.characterName.trim();
    const description = this.characterDescription.trim();
    if ((!this.editingCharacterId && name.length < 2) || description.length < 10) { this.errorMessage = 'Informe nome e uma descricao visual com pelo menos 10 caracteres.'; return; }
    if (this.sourceMode === 'uploaded' && !this.primaryFile) { this.errorMessage = 'Selecione a imagem principal do personagem.'; return; }
    this.savingCharacter = true;
    this.errorMessage = null;
    try {
      let characterId: string;
      let versionId: string;
      if (this.editingCharacterId) {
        characterId = this.editingCharacterId;
        const version = await projectsService.createChildrenClipCharacterVersion(this.projectId, characterId, { description, origin: this.sourceMode, invariants: this.invariants }, this.authStore.token);
        versionId = version.id;
      } else {
        const character = await projectsService.createChildrenClipCharacter(this.projectId, { name, description, sourceMode: this.sourceMode, scope: this.characterScope, roleName: this.roleName.trim() || null, invariants: this.invariants }, this.authStore.token);
        characterId = character.id;
        versionId = character.versions[0].id;
      }
      if (this.sourceMode === 'uploaded' && this.primaryFile) await projectsService.uploadChildrenClipCharacterAsset(this.projectId, characterId, versionId, this.primaryFile, 'primary_reference', 'Imagem principal', this.authStore.token);
      this.resetForm();
      await Promise.all([this.loadCharacters(), this.loadPlan()]);
    } catch (error) { this.captureError(error, 'Falha ao salvar personagem'); } finally { this.savingCharacter = false; }
  }

  startNewVersion(character: ChildrenClipCharacter) {
    this.editingCharacterId = character.id;
    this.characterName = character.name;
    this.characterDescription = character.description;
    this.invariantsText = character.versions[0]?.invariants.join('\n') ?? '';
    this.sourceMode = 'generated';
    this.primaryFile = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm() { this.editingCharacterId = null; this.characterName = ''; this.roleName = ''; this.characterDescription = ''; this.invariantsText = ''; this.sourceMode = 'generated'; this.primaryFile = null; }

  async retryGeneration(characterId: string, versionId: string) {
    if (!this.authStore.token) return;
    try { await projectsService.retryChildrenClipCharacterGeneration(this.projectId, characterId, versionId, this.authStore.token); await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao reiniciar geracao'); }
  }
  async retryAudioAnalysis() {
    if (!this.authStore.token) return;
    try { this.audioStatus = await projectsService.retryChildrenClipAudioAnalysis(this.projectId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar analise da musica'); }
  }
  async replaceTrack() {
    if (!this.authStore.token || !this.replacementTrack) return;
    this.replacingTrack = true;
    try {
      await this.projectsStore.uploadTrack(this.projectId, this.replacementTrack, null, null, null, this.project?.lyrics?.rawText || null, this.authStore.token);
      this.replacementTrack = null;
      await this.loadAudioAnalysis();
    } catch (error) { this.captureError(error, 'Falha ao substituir musica'); } finally { this.replacingTrack = false; }
  }
  async approveVersion(characterId: string, versionId: string) {
    if (!this.authStore.token) return;
    try { await projectsService.approveChildrenClipCharacterVersion(this.projectId, characterId, versionId, this.authStore.token); await Promise.all([this.loadCharacters(), this.loadPlan()]); } catch (error) { this.captureError(error, 'Falha ao aprovar versao'); }
  }
  async rejectVersion(characterId: string, versionId: string) { if (!this.authStore.token) return; try { await projectsService.rejectChildrenClipCharacterVersion(this.projectId, characterId, versionId, this.authStore.token); await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao rejeitar versao'); } }
  async uploadSupplementary(characterId: string, versionId: string) {
    if (!this.authStore.token || !this.versionFiles[versionId]) return;
    try {
      const role = this.assetRoles[versionId] ?? 'pose';
      const label = (this.assetLabels[versionId] || '').trim();
      if (role === 'mouth_shape' && !['a', 'e', 'o', 'u', 'closed', 'rest'].includes(label.toLowerCase())) {
        this.errorMessage = 'Informe A, E, O, U ou closed para identificar a forma de boca.';
        return;
      }
      await projectsService.uploadChildrenClipCharacterAsset(this.projectId, characterId, versionId, this.versionFiles[versionId]!, role, label, this.authStore.token);
      this.versionFiles = { ...this.versionFiles, [versionId]: null };
      this.assetLabels = { ...this.assetLabels, [versionId]: '' };
      await this.loadCharacters();
    } catch (error) { this.captureError(error, 'Falha ao enviar imagem complementar'); }
  }
  async generateSupplementary(characterId: string, versionId: string) {
    if (!this.authStore.token) return;
    const role = this.assetRoles[versionId] ?? 'pose';
    const label = (this.assetLabels[versionId] || '').trim();
    if (!label) { this.errorMessage = 'Descreva a pose, expressão, ângulo ou forma que deseja gerar.'; return; }
    if (role === 'mouth_shape' && !['a', 'e', 'o', 'u', 'closed', 'rest'].includes(label.toLowerCase())) { this.errorMessage = 'Informe A, E, O, U ou closed para a boca.'; return; }
    try {
      await projectsService.generateChildrenClipCharacterAsset(this.projectId, characterId, versionId, role, label, null, this.authStore.token);
      this.assetLabels = { ...this.assetLabels, [versionId]: '' };
      await this.loadCharacters();
    } catch (error) { this.captureError(error, 'Falha ao gerar asset complementar'); }
  }
  async retryCharacterAsset(characterId: string, versionId: string, characterAssetId: string) { if (!this.authStore.token) return; try { await projectsService.retryChildrenClipCharacterAsset(this.projectId, characterId, versionId, characterAssetId, this.authStore.token); await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao reiniciar asset do personagem'); } }
  async approveCharacterAsset(characterId: string, versionId: string, characterAssetId: string) { if (!this.authStore.token) return; try { await projectsService.approveChildrenClipCharacterAsset(this.projectId, characterId, versionId, characterAssetId, this.authStore.token); await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao aprovar asset do personagem'); } }
  async rejectCharacterAsset(characterId: string, versionId: string, characterAssetId: string) { if (!this.authStore.token) return; try { await projectsService.rejectChildrenClipCharacterAsset(this.projectId, characterId, versionId, characterAssetId, this.authStore.token); await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao rejeitar asset do personagem'); } }
  async attachLibraryCharacter() {
    if (!this.authStore.token || !this.libraryCharacterId) return;
    this.attachingLibraryCharacter = true;
    try {
      await projectsService.attachChildrenClipLibraryCharacter(this.projectId, this.libraryCharacterId, this.libraryRoleName.trim() || null, this.authStore.token);
      this.libraryCharacterId = '';
      this.libraryRoleName = '';
      await Promise.all([this.loadCharacters(), this.loadPlan()]);
    } catch (error) { this.captureError(error, 'Falha ao vincular personagem da biblioteca'); }
    finally { this.attachingLibraryCharacter = false; }
  }

  statusLabel(status: ChildrenClipCharacterVersion['status']) { return ({ draft: 'Rascunho', queued: 'Enfileirada', generating: 'Gerando', ready_for_review: 'Revisar', approved: 'Aprovada', rejected: 'Rejeitada', failed: 'Falhou' })[status]; }
  originLabel(origin: ChildrenClipCharacterVersion['origin']) { return ({ generated: 'Gerada', uploaded: 'Enviada', hybrid: 'Hibrida' })[origin]; }
  roleLabel(role: CharacterAssetRole) { return ({ primary_reference: 'Referencia principal', front_view: 'Vista frontal', side_view: 'Vista lateral', back_view: 'Vista traseira', portrait: 'Retrato', expression: 'Expressao', pose: 'Pose', mouth_shape: 'Forma de boca', eye_state: 'Olhos', source_reference: 'Referencia original' })[role]; }
  characterAssetStatusLabel(status: ChildrenClipCharacter['versions'][number]['assets'][number]['status']) { return ({ draft: 'Rascunho', queued: 'Enfileirado', generating: 'Gerando', ready_for_review: 'Revisar', approved: 'Aprovado', rejected: 'Rejeitado', failed: 'Falhou' })[status]; }
  async generatePlan() {
    if (!this.authStore.token) return;
    try { this.planStatus = await projectsService.generateChildrenClipProductionPlan(this.projectId, this.planRevision.trim() || null, this.authStore.token); this.planRevision = ''; } catch (error) { this.captureError(error, 'Falha ao iniciar planejamento'); }
  }
  async savePlanText() {
    if (!this.authStore.token) return;
    this.planSaveFeedback = null;
    let visualBible: Record<string, unknown>;
    let narrative: Record<string, unknown>;

    try {
      visualBible = JSON.parse(this.visualBibleJson) as Record<string, unknown>;
    } catch {
      this.planSaveFeedback = { type: 'error', message: 'A Bíblia visual contém um JSON inválido. Corrija o conteúdo antes de salvar.' };
      return;
    }

    try {
      narrative = JSON.parse(this.narrativeJson) as Record<string, unknown>;
    } catch {
      this.planSaveFeedback = { type: 'error', message: 'A narrativa contém um JSON inválido. Corrija o conteúdo antes de salvar.' };
      return;
    }

    this.savingPlanText = true;
    try {
      this.planStatus = await projectsService.updateChildrenClipProductionPlan(this.projectId, { visualBible, narrative }, this.authStore.token);
      this.planSaveFeedback = { type: 'success', message: 'Bíblia visual e narrativa salvas com sucesso.' };
    } catch (error) {
      this.planSaveFeedback = {
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao salvar a Bíblia visual e a narrativa.'
      };
    } finally {
      this.savingPlanText = false;
    }
  }
  async saveShot(shot: ChildrenClipShot) {
    if (!this.authStore.token) return;
    try {
      this.planStatus = await projectsService.updateChildrenClipShot(this.projectId, shot.id, {
        title: shot.title, description: shot.description, startSeconds: shot.startSeconds, endSeconds: shot.endSeconds,
        renderMode: shot.renderMode, framing: shot.framing, cameraMovement: shot.cameraMovement,
        characterAction: shot.characterAction, environment: shot.environment, backgroundPrompt: shot.backgroundPrompt,
        transitionIn: shot.transitionIn, transitionOut: shot.transitionOut, motionPreset: shot.motionPreset
      }, this.authStore.token);
    } catch (error) { this.captureError(error, 'Falha ao salvar tomada'); }
  }
  async approvePlan() {
    if (!this.authStore.token) return;
    try { this.planStatus = await projectsService.approveChildrenClipProductionPlan(this.projectId, this.authStore.token); await Promise.all([this.projectsStore.fetchProject(this.projectId, this.authStore.token), this.loadProductionAssets()]); } catch (error) { this.captureError(error, 'Falha ao aprovar plano'); }
  }
  onShotAssetFileSelected(shotId: string, event: Event) { this.shotAssetFiles = { ...this.shotAssetFiles, [shotId]: (event.target as HTMLInputElement).files?.[0] ?? null }; }
  async generateMissingBackgrounds() {
    if (!this.authStore.token) return;
    this.generatingBackgrounds = true;
    try { this.productionAssets = await projectsService.generateMissingChildrenClipBackgrounds(this.projectId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao enfileirar os fundos'); } finally { this.generatingBackgrounds = false; }
  }
  requestStep4Reset() {
    if (this.resettingStep4) return;
    const confirmed = window.confirm(
      'Gerar toda a Etapa 4 do zero? Os cenários, assets e renders atuais serão arquivados e não serão reutilizados. O sistema gerará um cenário limpo e uma prévia completa para cada tomada, aplicando as referências atuais de todos os personagens permitidos.'
    );
    if (confirmed) void this.resetStep4();
  }
  async resetStep4() {
    if (!this.authStore.token || this.resettingStep4) return;
    this.resettingStep4 = true;
    this.step4Feedback = null;
    this.step4FeedbackVisible = false;
    try {
      this.productionAssets = await projectsService.resetChildrenClipProductionAssets(this.projectId, this.authStore.token);
      Object.values(this.shotAssetUrls).forEach((url) => URL.revokeObjectURL(url));
      Object.values(this.renderUrls).forEach((url) => URL.revokeObjectURL(url));
      Object.values(this.heroUrls).forEach((url) => URL.revokeObjectURL(url));
      if (this.finalRenderUrl) URL.revokeObjectURL(this.finalRenderUrl);
      this.shotAssetUrls = {};
      this.renderUrls = {};
      this.heroUrls = {};
      this.finalRenderUrl = null;
      this.animationStatus = null;
      this.outputStatus = null;
      this.step4Feedback = { type: 'success', message: `Etapa 4 reiniciada. ${this.productionAssets.summary.totalShots} cenários e ${this.productionAssets.summary.requiredStoryboards} prévias completas foram enfileirados com as referências atuais dos personagens.` };
      this.step4FeedbackVisible = true;
      await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
    } catch (error) {
      this.step4Feedback = { type: 'error', message: error instanceof Error ? error.message : 'Falha ao reiniciar a Etapa 4.' };
      this.step4FeedbackVisible = true;
    } finally {
      this.resettingStep4 = false;
    }
  }
  openImagePreview(assetId: string, title: string) {
    const url = this.shotAssetUrls[assetId];
    if (!url) return;
    this.previewImageUrl = url;
    this.previewImageTitle = title;
  }
  closeImagePreview() {
    this.previewImageUrl = null;
    this.previewImageTitle = '';
  }
  onPreviewKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.previewImageUrl) this.closeImagePreview();
  }
  async generateLocationBackgrounds(locationId: string) {
    if (!this.authStore.token) return;
    this.generatingLocations = { ...this.generatingLocations, [locationId]: true };
    try { this.productionAssets = await projectsService.generateChildrenClipLocationBackgrounds(this.projectId, locationId, this.authStore.token); }
    catch (error) { this.captureError(error, 'Falha ao avançar a geração desta Location'); }
    finally { this.generatingLocations = { ...this.generatingLocations, [locationId]: false }; }
  }
  async refreshStyleLock() {
    if (!this.authStore.token) return;
    this.refreshingStyleLock = true;
    try { this.productionAssets = await projectsService.refreshChildrenClipStyleLock(this.projectId, this.authStore.token); }
    catch (error) { this.captureError(error, 'Falha ao atualizar o Project Style Lock'); }
    finally { this.refreshingStyleLock = false; }
  }
  async replanShots() {
    if (!this.authStore.token) return;
    this.replanningShots = true;
    try {
      this.planStatus = await projectsService.replanChildrenClipShots(this.projectId, this.planRevision.trim() || null, this.authStore.token);
      this.planRevision = '';
      this.productionAssets = null;
    } catch (error) { this.captureError(error, 'Falha ao replanejar tomadas'); }
    finally { this.replanningShots = false; }
  }
  async generateShotAsset(shotId: string) {
    if (!this.authStore.token) return;
    const role = (this.shotAssetRoles[shotId] || 'background') as Exclude<ChildrenClipShotAssetRole, 'character_pose'>;
    try { this.productionAssets = await projectsService.generateChildrenClipShotAsset(this.projectId, shotId, role, this.shotAssetPrompts[shotId] || null, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao gerar nova versao do asset'); }
  }
  async uploadShotAsset(shotId: string) {
    if (!this.authStore.token || !this.shotAssetFiles[shotId]) return;
    const role = this.shotAssetRoles[shotId] || 'background';
    const characterVersionId = role === 'character_pose' ? this.shotPoseCharacterVersions[shotId] || null : null;
    if (role === 'character_pose' && !characterVersionId) { this.errorMessage = 'Selecione a qual personagem pertence esta pose.'; return; }
    try { this.productionAssets = await projectsService.uploadChildrenClipShotAsset(this.projectId, shotId, this.shotAssetFiles[shotId]!, role, characterVersionId, this.authStore.token); this.shotAssetFiles = { ...this.shotAssetFiles, [shotId]: null }; await this.loadShotAssetUrls(); } catch (error) { this.captureError(error, 'Falha ao enviar asset'); }
  }
  charactersForShot(shot: ChildrenClipShot) { const explicit = Array.isArray(shot.characterVersionIds); const ids = explicit ? shot.characterVersionIds as string[] : []; return this.characters.filter((character) => character.selectedVersionId && (!explicit || ids.includes(character.selectedVersionId))); }
  shotsForLocation(location: ChildrenClipProductionLocation) { const ids = new Set(location.shots.map((shot) => shot.id)); return this.productionAssets?.shots.filter((shot) => ids.has(shot.id)) || []; }
  shotById(shotId: string) { return this.productionAssets?.shots.find((shot) => shot.id === shotId); }
  shotNumber(shotId: string) { return (this.shotById(shotId)?.index ?? 0) + 1; }
  canCreateBackground(shotId: string) { const location = this.productionAssets?.locations.find((item) => item.shots.some((shot) => shot.id === shotId)); return Boolean(location && (location.master || location.anchorShotId === shotId)); }
  locationPhaseLabel(phase: ChildrenClipProductionLocation['phase']) { return ({ needs_master: 'Master pendente', master_generating: 'Gerando master', master_in_review: 'Master em revisão', ready_for_variants: 'Gerar variações', variants_in_review: 'Variações em revisão', complete: 'Location completa' })[phase]; }
  entityNames(versionIds: string[] | null) { const ids = Array.isArray(versionIds) ? versionIds : []; return this.characters.filter((character) => character.selectedVersionId && ids.includes(character.selectedVersionId)).map((character) => character.name).join(', '); }
  async approveShotAsset(assetId: string) { if (!this.authStore.token) return; try { this.productionAssets = await projectsService.approveChildrenClipShotAsset(this.projectId, assetId, this.authStore.token); if (this.productionAssets.summary.readyForAnimation) await Promise.all([this.loadAnimation(), this.loadOutput()]); } catch (error) { this.captureError(error, 'Falha ao aprovar asset'); } }
  async rejectShotAsset(assetId: string) { if (!this.authStore.token) return; try { this.productionAssets = await projectsService.rejectChildrenClipShotAsset(this.projectId, assetId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao rejeitar asset'); } }
  async retryShotAsset(assetId: string) { if (!this.authStore.token) return; try { this.productionAssets = await projectsService.retryChildrenClipShotAsset(this.projectId, assetId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar geracao do asset'); } }
  shotAssetRoleLabel(role: ChildrenClipShotAssetRole) { return ({ background: 'Cenário limpo', foreground: 'Primeiro plano', prop: 'Objeto', character_pose: 'Pose de personagem', storyboard_frame: 'Prévia completa' })[role]; }
  shotAssetStatusLabel(status: ChildrenClipShotAsset['status']) { return ({ draft: 'Rascunho', queued: 'Enfileirado', generating: 'Gerando', ready_for_review: 'Revisar', approved: 'Aprovado', rejected: 'Rejeitado', failed: 'Falhou' })[status]; }
  async renderMissingShots() { if (!this.authStore.token) return; this.renderingMissingShots = true; try { this.animationStatus = await projectsService.renderMissingChildrenClipShots(this.projectId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao enfileirar animacoes'); } finally { this.renderingMissingShots = false; } }
  async renderShot(shotId: string) { if (!this.authStore.token) return; try { this.animationStatus = await projectsService.renderChildrenClipShot(this.projectId, shotId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao enfileirar tomada 2D'); } }
  async retryShotRender(attemptId: string) { if (!this.authStore.token) return; try { this.animationStatus = await projectsService.retryChildrenClipShotRender(this.projectId, attemptId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar render 2D'); } }
  renderStatusLabel(status: ChildrenClipShotRenderAttempt['status']) { return ({ queued: 'Enfileirado', rendering: 'Renderizando', completed: 'Concluido', failed: 'Falhou' })[status]; }
  heroConfig(shotId: string) { return this.heroConfigs[shotId] || { provider: 'local' as const, model: 'veo-3.1-fast' as const, resolution: '720p' as const, referenceMode: 'frame' as const, ingredientAssetIds: [] }; }
  attemptRequest(attempt: { requestMetadata: ChildrenClipVideoGenerationRequest | null }) { return attempt.requestMetadata || { provider: 'local' as const }; }
  attemptMetric(attempt: { generationManifest: Record<string, unknown> | null }, key: string) { return attempt.generationManifest?.[key] ?? null; }
  isIngredientSelected(shotId: string, assetId: string) { return this.heroConfig(shotId).ingredientAssetIds?.includes(assetId) ?? false; }
  toggleIngredient(shotId: string, assetId: string) { const config = this.heroConfig(shotId); const selected = config.ingredientAssetIds || []; if (selected.includes(assetId)) config.ingredientAssetIds = selected.filter((id) => id !== assetId); else if (selected.length < 3) config.ingredientAssetIds = [...selected, assetId]; }
  async generateHeroShot(shotId: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.generateChildrenClipHeroShot(this.projectId, shotId, this.heroConfig(shotId), this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao gerar tomada especial'); } }
  async retryHeroShot(attemptId: string, shotId: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.retryChildrenClipHeroShot(this.projectId, attemptId, this.heroConfig(shotId), this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar tomada especial'); } }
  async approveHeroShot(attemptId: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.approveChildrenClipHeroShot(this.projectId, attemptId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao aprovar tomada Wan'); } }
  async rejectHeroShot(attemptId: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.rejectChildrenClipHeroShot(this.projectId, attemptId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao rejeitar tomada Wan'); } }
  async renderFinalClip() { if (!this.authStore.token) return; try { if (this.finalRenderUrl) { URL.revokeObjectURL(this.finalRenderUrl); this.finalRenderUrl = null; } this.outputStatus = await projectsService.renderChildrenClipFinal(this.projectId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao iniciar render final'); } }
  async retryFinalClip(id: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.retryChildrenClipFinal(this.projectId, id, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar render final'); } }
  formatTime(seconds: number) { const safe = Math.max(0, seconds); return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`; }
  formatTimePrecise(seconds: number) { const safe = Math.max(0, seconds); return `${this.formatTime(safe)}.${Math.floor((safe % 1) * 10)}`; }
  captureError(error: unknown, fallback: string) { this.errorMessage = error instanceof Error ? error.message : fallback; }
}
</script>

<style scoped>
.studio-width, .studio-hero { width: min(1120px, 100%); margin-right: auto; margin-left: auto; }
.status-pill { padding: 8px 12px; border-radius: 999px; color: #92520a; background: #fff0d4; font-size: 0.82rem; font-weight: 800; }
.setup-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.setup-card { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 18px; }
.setup-card__icon { display: inline-flex; width: 42px; height: 42px; align-items: center; justify-content: center; border-radius: 12px; color: #9b5d0b; background: #fff0d4; }
.setup-card p, .character-panel p { margin: 4px 0 0; color: #65676b; }
.character-panel { padding: 24px; }
.audio-panel { padding: 24px; }
.audio-progress { display: grid; gap: 10px; margin-top: 18px; }
.audio-progress > div { display: flex; justify-content: space-between; gap: 12px; color: #65676b; font-size: 0.84rem; }
.replace-track { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 12px; margin-top: 14px; }
.audio-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
.audio-metrics > div { display: grid; gap: 3px; padding: 12px; border-radius: 12px; background: #f6f7f8; }
.audio-metrics span { color: #65676b; font-size: 0.75rem; }
.waveform { display: flex; height: 56px; align-items: center; gap: 1px; margin: 18px 0; overflow: hidden; }
.waveform i { flex: 1 1 1px; min-width: 1px; border-radius: 2px; background: #e98b17; }
.music-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.music-sections > div { position: relative; display: grid; gap: 3px; overflow: hidden; padding: 10px; border: 1px solid #e4e6eb; border-radius: 10px; }
.music-sections span { color: #65676b; font-size: 0.72rem; }
.music-sections em { position: absolute; bottom: 0; left: 0; height: 3px; background: #e98b17; }
.lyric-cues { margin-top: 16px; }
.lyric-cues summary { cursor: pointer; font-weight: 700; }
.lyric-cues ol { display: grid; gap: 6px; padding-left: 0; list-style: none; }
.lyric-cues li { display: grid; grid-template-columns: 48px 1fr; gap: 8px; }
.lyric-cues time { color: #9b5d0b; font-variant-numeric: tabular-nums; }
.plan-panel { padding: 24px; }
.plan-save-area { display: grid; justify-items: start; gap: 10px; margin-top: 12px; }
.plan-save-area .v-alert { width: 100%; }
.step4-reset-button { color: #fff; background: #b42318; }
.step4-reset-button:hover:not(:disabled) { background: #8f1c13; }
.plan-blockers { margin-top: 18px; padding: 14px; border-radius: 12px; background: #fff7e7; color: #7b5314; }
.plan-blockers ul { margin-bottom: 0; }
.plan-start { margin-top: 18px; }
.plan-json-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0 12px; }
.code-textarea { font-family: Consolas, monospace; font-size: 0.78rem; }
.timeline-strip { display: flex; height: 44px; margin: 22px 0; overflow: hidden; border-radius: 10px; background: #f0f2f5; }
.timeline-strip > div { display: flex; min-width: 3px; align-items: center; justify-content: center; border-right: 1px solid #fff; color: #fff; background: #e98b17; font-size: 0.68rem; }
.timeline-strip > div:nth-child(even) { background: #5b8def; }
.shot-list { display: grid; gap: 10px; }
.shot-card { border: 1px solid #dfe3e8; border-radius: 12px; background: #fafbfc; }
.shot-card summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px; cursor: pointer; }
.shot-card summary > span { display: grid; gap: 3px; }
.shot-card summary small, .shot-card summary > span:last-child { color: #65676b; font-size: 0.76rem; }
.shot-form { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 0 14px 16px; }
.shot-form__wide { grid-column: 1 / -1; }
.plan-final-actions { display: grid; gap: 12px; margin-top: 20px; padding-top: 18px; border-top: 1px solid #e4e6eb; }
.plan-final-actions > div { display: flex; justify-content: flex-end; gap: 10px; }
.approved-plan-actions { display: grid; gap: 12px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #e4e6eb; }
.panel-heading, .list-heading, .character-card__heading, .character-card__heading > div, .version-card header, .version-card header > div { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.panel-heading { align-items: flex-start; }
.panel-heading h3, .list-heading h3 { margin: 0; font-size: 1.35rem; }
.character-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 22px; }
.character-form__wide { grid-column: 1 / -1; }
.character-list-section { display: grid; gap: 16px; }
.list-heading > span { color: #65676b; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 44px; color: #65676b; text-align: center; }
.character-card { padding: 22px; }
.character-card__heading h4 { margin: 0; font-size: 1.15rem; }
.character-card__heading p { margin: 3px 0 0; color: #65676b; }
.approval-dot { width: 12px; height: 12px; border-radius: 50%; background: #c8ccd2; }
.approval-dot--approved { background: #2e9b55; box-shadow: 0 0 0 4px #dff3e5; }
.version-list { display: grid; gap: 14px; margin-top: 18px; }
.version-card { padding: 18px; border: 1px solid #dfe3e8; border-radius: 14px; background: #fafbfc; }
.version-card--approved { border-color: #8bc69e; background: #f4fbf6; }
.version-origin { margin-left: 8px; color: #65676b; font-size: 0.78rem; }
.version-status { padding: 5px 9px; border-radius: 999px; background: #e8eaed; font-size: 0.75rem; font-weight: 800; }
.version-status--approved { color: #19703a; background: #dff3e5; }
.version-status--completed { color: #19703a; background: #dff3e5; }
.version-status--failed { color: #a32525; background: #fbe1e1; }
.version-status--queued, .version-status--generating { color: #92520a; background: #fff0d4; }
.version-description { color: #4d5156; }
.generation-progress { display: grid; gap: 8px; margin: 14px 0; color: #65676b; font-size: 0.82rem; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
.asset-grid figure { overflow: hidden; margin: 0; border: 1px solid #dfe3e8; border-radius: 12px; background: #fff; }
.asset-grid img, .asset-loading { width: 100%; aspect-ratio: 1; object-fit: contain; background: #f3f4f6; }
.asset-loading { display: flex; align-items: center; justify-content: center; }
.asset-grid figcaption { padding: 8px 10px; color: #65676b; font-size: 0.76rem; }
.version-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.approved-copy { display: inline-flex; align-items: center; gap: 6px; color: #19703a; font-weight: 700; }
.supplementary-assets { margin-top: 14px; }
.supplementary-assets summary { color: #4b648a; cursor: pointer; font-weight: 700; }
.supplementary-assets__form { display: grid; grid-template-columns: 180px 1fr auto; gap: 10px; margin-top: 10px; }
.library-character-form { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(180px, 1fr) auto; gap: 12px; margin-top: 18px; }
.supplementary-assets__form { grid-template-columns: 150px minmax(170px, 1fr) minmax(170px, 1fr) auto auto; }
.production-assets-actions { display: flex; align-items: center; gap: 16px; margin: 18px 0; }
.production-location-list { display: grid; gap: 22px; }
.production-location-card { overflow: hidden; border: 1px solid #d9dee5; border-radius: 16px; background: #f7f9fb; }
.location-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 18px 20px; border-bottom: 1px solid #dfe3e8; background: #fff; }
.location-heading h4 { margin: 2px 0 4px; font-size: 1.16rem; }
.location-heading p, .location-master p { margin: 0; color: #65676b; }
.location-heading__status { display: grid; justify-items: end; gap: 5px; white-space: nowrap; }
.location-heading__status small { color: #65676b; }
.location-kicker { color: #8b5a17; font-size: .7rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.location-master { display: grid; grid-template-columns: 190px minmax(0, 1fr) auto; align-items: center; gap: 16px; margin: 16px; padding: 14px; border: 1px dashed #d2a15d; border-radius: 14px; background: #fff9ef; }
.location-master--approved { border-style: solid; border-color: #78b78b; background: #f1faf4; }
.location-master img, .location-master__placeholder { width: 190px; aspect-ratio: 16 / 9; border-radius: 10px; object-fit: cover; background: #edf0f4; }
.location-master__preview { width: 190px; border-radius: 10px; }
.location-master__placeholder { display: flex; align-items: center; justify-content: center; color: #8b5a17; }
.location-master > div:not(.location-master__placeholder) { display: grid; gap: 5px; }
.location-shot-list { display: grid; gap: 12px; padding: 0 16px 16px; }
.shot-asset-card { padding: 16px; border: 1px solid #dfe3e8; border-radius: 14px; background: #fafbfc; }
.shot-asset-card--anchor { border-color: #d2a15d; }
.shot-plan-summary { display: grid; gap: 6px; padding: 12px; border-radius: 10px; background: #fff; }
.shot-plan-summary p { margin: 0; line-height: 1.45; }
.shot-asset-card > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shot-asset-card > header div { display: grid; gap: 3px; }
.shot-asset-card small, .shot-asset-card > header > span, .shot-asset-card > p { color: #65676b; }
.shot-assets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin: 14px 0; }
.shot-assets-grid figure { overflow: hidden; margin: 0; padding-bottom: 12px; border: 1px solid #dfe3e8; border-radius: 12px; background: #fff; }
.shot-assets-grid figure.shot-asset--approved { border-color: #67ae7d; box-shadow: 0 0 0 2px #dff3e5; }
.shot-assets-grid img, .shot-assets-grid .asset-loading { width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #f0f2f5; }
.asset-preview-trigger { position: relative; display: block; width: 100%; overflow: hidden; padding: 0; border: 0; background: #f0f2f5; color: #fff; cursor: zoom-in; }
.asset-preview-trigger img { display: block; }
.asset-preview-trigger > span { position: absolute; right: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 999px; background: rgb(17 24 39 / 78%); font-size: .76rem; font-weight: 700; opacity: 0; transform: translateY(4px); transition: opacity .15s ease, transform .15s ease; }
.asset-preview-trigger:hover > span, .asset-preview-trigger:focus-visible > span { opacity: 1; transform: translateY(0); }
.asset-preview-trigger:focus-visible { outline: 3px solid #1f6feb; outline-offset: -3px; }
.shot-assets-grid figcaption { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px 0; }
.shot-assets-grid .version-actions, .shot-assets-grid .v-alert, .asset-job-progress { margin-right: 12px; margin-left: 12px; }
.asset-job-progress { display: grid; gap: 5px; color: #65676b; }
.shot-asset-form { display: grid; grid-template-columns: 180px 1fr auto; gap: 10px; margin-top: 12px; align-items: end; }
.animation-shot-list { display: grid; gap: 12px; }
.animation-shot-card { display: grid; gap: 12px; padding: 16px; border: 1px solid #dfe3e8; border-radius: 14px; background: #fafbfc; }
.animation-shot-card > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.animation-shot-card > header > div { display: grid; gap: 3px; }
.animation-shot-card small { color: #65676b; }
.shot-render-preview { width: min(640px, 100%); max-height: 360px; border-radius: 12px; background: #111; }
.render-manifest { max-height: 260px; overflow: auto; padding: 12px; border-radius: 8px; background: #1e2430; color: #e8edf5; font-size: .72rem; white-space: pre-wrap; }
.hero-shot-list, .final-render-card { display: grid; gap: 12px; margin-top: 18px; }
.video-provider-panel { margin-top: 12px; padding: 12px; border: 1px solid #e4e6eb; border-radius: 12px; background: #fafbfc; }
.video-provider-panel summary { cursor: pointer; font-weight: 800; }
.provider-options, .provider-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.provider-options label { padding: 12px; border: 1px solid #d9dce2; border-radius: 10px; cursor: pointer; }
.provider-options label.selected { border-color: #1769ff; background: #eef4ff; }
.provider-fields label, .provider-prompt { display: grid; gap: 5px; color: #4c5058; font-size: .84rem; font-weight: 700; }
.provider-fields select, .provider-fields input, .provider-prompt textarea { width: 100%; padding: 9px 10px; border: 1px solid #cfd3da; border-radius: 8px; background: white; color: #202124; }
.provider-prompt { margin-top: 12px; }
.reference-picker { display: grid; gap: 8px; margin-top: 12px; }
.reference-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.reference-grid button { display: grid; gap: 6px; padding: 7px; border: 2px solid transparent; border-radius: 10px; background: white; text-align: left; }
.reference-grid button.selected { border-color: #1769ff; background: #eef4ff; }
.reference-grid img { width: 100%; height: 82px; object-fit: cover; border-radius: 6px; }
.reference-grid span { font-size: .75rem; line-height: 1.2; }
.attempt-facts { display: flex; flex-wrap: wrap; gap: 7px 14px; margin-top: 10px; color: #565b65; font-size: .78rem; }
.final-render-preview { width: min(820px, 100%); max-height: 460px; border-radius: 14px; background: #111; }
.final-download { width: fit-content; text-decoration: none; }
.asset-lightbox { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgb(3 7 18 / 88%); backdrop-filter: blur(4px); }
.asset-lightbox__panel { display: grid; width: min(1400px, 96vw); max-height: 94vh; overflow: hidden; border-radius: 16px; background: #fff; box-shadow: 0 24px 80px rgb(0 0 0 / 45%); }
.asset-lightbox__panel header, .asset-lightbox__panel footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; }
.asset-lightbox__panel header strong { line-height: 1.35; }
.asset-lightbox__panel footer { color: #65676b; font-size: .84rem; }
.asset-lightbox__image { display: flex; min-height: 220px; align-items: center; justify-content: center; overflow: auto; background: #111827; }
.asset-lightbox__image img { display: block; width: auto; max-width: 100%; height: auto; max-height: calc(94vh - 132px); object-fit: contain; }
.asset-preview-close { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.asset-preview-close:hover { background: #edf0f4; }
@media (max-width: 700px) { .setup-grid, .character-form, .audio-metrics, .replace-track, .plan-json-grid, .shot-form, .location-master { grid-template-columns: 1fr; } .character-form__wide, .shot-form__wide { grid-column: auto; } .character-panel, .character-card, .audio-panel, .plan-panel { padding: 18px; } .supplementary-assets__form, .shot-asset-form, .library-character-form { grid-template-columns: 1fr; } .shot-card summary, .location-heading { align-items: flex-start; flex-direction: column; } .location-heading__status { justify-items: start; } .location-master img, .location-master__placeholder, .location-master__preview { width: 100%; } }
</style>
