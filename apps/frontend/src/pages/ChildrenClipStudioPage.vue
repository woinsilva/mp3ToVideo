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
                <figure v-for="asset in version.assets" :key="asset.id"><img v-if="assetUrls[asset.id]" :src="assetUrls[asset.id]" :alt="asset.label || asset.role" /><div v-else class="asset-loading"><v-progress-circular indeterminate size="26" /></div><figcaption>{{ asset.label || roleLabel(asset.role) }}</figcaption></figure>
              </div>

              <div class="version-actions">
                <button v-if="version.status === 'failed'" class="app-button" type="button" @click="retryGeneration(character.id, version.id)">Tentar gerar novamente</button>
                <button v-if="version.status === 'ready_for_review'" class="app-button" type="button" @click="approveVersion(character.id, version.id)">Aprovar esta versao</button>
                <span v-if="version.status === 'approved'" class="approved-copy"><v-icon icon="mdi-lock-check" /> Identidade bloqueada para producao</span>
              </div>

              <details class="supplementary-assets">
                <summary>Adicionar outra pose, expressao ou angulo</summary>
                <div class="supplementary-assets__form">
                  <select v-model="assetRoles[version.id]" class="auth-input"><option value="front_view">Vista frontal</option><option value="side_view">Vista lateral</option><option value="back_view">Vista traseira</option><option value="portrait">Retrato</option><option value="expression">Expressao</option><option value="pose">Pose</option><option value="mouth_shape">Forma de boca</option><option value="eye_state">Estado dos olhos</option><option value="source_reference">Referencia original</option></select>
                  <input class="auth-input" type="file" accept="image/jpeg,image/png,image/webp" @change="onVersionFileSelected(version.id, $event)" />
                  <button class="app-button app-button--secondary" type="button" :disabled="!versionFiles[version.id]" @click="uploadSupplementary(character.id, version.id)">Enviar</button>
                </div>
              </details>
            </section>
          </div>
        </article>
      </section>

      <section class="surface-card studio-width plan-panel">
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
          <button v-if="planStatus.plan.status !== 'approved'" class="app-button app-button--secondary" type="button" @click="savePlanText">Salvar biblia e narrativa</button>

          <div class="timeline-strip">
            <div v-for="shot in planStatus.shots" :key="shot.id" :style="{ width: `${(shot.durationSeconds / Math.max(1, audioStatus?.analysis?.durationSeconds || 1)) * 100}%` }" :title="`${shot.index + 1}. ${shot.title}`"><span>{{ shot.index + 1 }}</span></div>
          </div>

          <div class="shot-list">
            <details v-for="shot in planStatus.shots" :key="shot.id" class="shot-card">
              <summary><span><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ formatTimePrecise(shot.startSeconds) }} - {{ formatTimePrecise(shot.endSeconds) }} · {{ shot.renderMode === 'animation_2d' ? '2D' : shot.renderMode }}</small></span><span>{{ shot.lyricText || 'Instrumental' }}</span></summary>
              <div class="shot-form">
                <label class="auth-input-group"><span class="auth-input-label">Titulo</span><input v-model="shot.title" class="auth-input" :disabled="planStatus.plan.status === 'approved'" /></label>
                <label class="auth-input-group"><span class="auth-input-label">Modo</span><select v-model="shot.renderMode" class="auth-input" :disabled="planStatus.plan.status === 'approved'"><option value="animation_2d">Animacao 2D</option><option value="wan">Tomada Wan</option><option value="hybrid">Hibrida</option></select></label>
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

      <section v-if="planStatus?.plan?.status === 'approved'" class="surface-card studio-width plan-panel production-assets-panel">
        <div class="panel-heading">
          <div><p class="page-eyebrow">Etapa 4</p><h3>Cenarios e assets das tomadas</h3><p>Gere fundos sem personagens, envie elementos próprios e aprove cada versão antes da animação.</p></div>
          <span v-if="productionAssets" class="version-status" :class="{ 'version-status--approved': productionAssets.summary.readyForAnimation }">{{ productionAssets.summary.approvedBackgrounds }}/{{ productionAssets.summary.totalShots }} fundos aprovados</span>
        </div>
        <div class="production-assets-actions">
          <button class="app-button" type="button" :disabled="generatingBackgrounds" @click="generateMissingBackgrounds">{{ generatingBackgrounds ? 'Enfileirando...' : 'Gerar fundos que faltam' }}</button>
          <span v-if="productionAssets?.summary.readyForAnimation" class="approved-copy"><v-icon icon="mdi-check-decagram" /> Assets mínimos prontos para animação</span>
        </div>

        <div v-if="productionAssets" class="production-shot-list">
          <article v-for="shot in productionAssets.shots" :key="shot.id" class="shot-asset-card">
            <header><div><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ formatTimePrecise(shot.startSeconds) }} - {{ formatTimePrecise(shot.endSeconds) }}</small></div><span>{{ shot.assets.length }} versão(ões)</span></header>
            <p>{{ shot.environment }}</p>
            <div v-if="shot.assets.length" class="shot-assets-grid">
              <figure v-for="asset in shot.assets" :key="asset.id" :class="{ 'shot-asset--approved': asset.status === 'approved' }">
                <img v-if="shotAssetUrls[asset.id]" :src="shotAssetUrls[asset.id]" :alt="asset.label || asset.role" />
                <div v-else-if="asset.status === 'queued' || asset.status === 'generating'" class="asset-loading"><v-progress-circular indeterminate size="28" /></div>
                <div v-else class="asset-loading"><v-icon icon="mdi-image-off-outline" /></div>
                <figcaption><strong>{{ shotAssetRoleLabel(asset.role) }} · v{{ asset.versionNumber }}</strong><span class="version-status" :class="`version-status--${asset.status}`">{{ shotAssetStatusLabel(asset.status) }}</span></figcaption>
                <div v-if="asset.status === 'queued' || asset.status === 'generating'" class="asset-job-progress"><v-progress-linear :model-value="asset.job?.progress || 0" color="warning" /><small>{{ asset.job?.detailMessage || 'Aguardando worker...' }} ({{ asset.job?.progress || 0 }}%)</small></div>
                <v-alert v-if="asset.errorMessage || asset.job?.errorMessage" density="compact" type="error" variant="tonal">{{ asset.errorMessage || asset.job?.errorMessage }}</v-alert>
                <div class="version-actions"><button v-if="asset.status === 'ready_for_review'" class="app-button" type="button" @click="approveShotAsset(asset.id)">Aprovar</button><button v-if="asset.status === 'failed'" class="app-button app-button--secondary" type="button" @click="retryShotAsset(asset.id)">Tentar novamente</button><span v-if="asset.status === 'approved'" class="approved-copy"><v-icon icon="mdi-lock-check" /> Aprovado</span></div>
              </figure>
            </div>
            <details class="supplementary-assets"><summary>Gerar nova versão ou enviar asset</summary><div class="shot-asset-form">
              <select v-model="shotAssetRoles[shot.id]" class="auth-input"><option value="background">Fundo</option><option value="foreground">Primeiro plano</option><option value="prop">Objeto</option><option value="storyboard_frame">Quadro de storyboard</option><option value="character_pose">Pose de personagem (somente upload)</option></select>
              <textarea v-model="shotAssetPrompts[shot.id]" class="auth-input auth-input--textarea" rows="2" :placeholder="shot.backgroundPrompt" />
              <button v-if="shotAssetRoles[shot.id] !== 'character_pose'" class="app-button app-button--secondary" type="button" @click="generateShotAsset(shot.id)">Gerar versão</button>
              <input class="auth-input" type="file" accept="image/jpeg,image/png,image/webp" @change="onShotAssetFileSelected(shot.id, $event)" />
              <button class="app-button app-button--secondary" type="button" :disabled="!shotAssetFiles[shot.id]" @click="uploadShotAsset(shot.id)">Enviar imagem</button>
            </div></details>
          </article>
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
            <header><div><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ shot.renderMode === 'hybrid' ? '2D + tomada especial' : shot.renderMode === 'wan' ? 'Tomada especial Wan' : 'Animacao 2D' }}</small></div><span v-if="shot.latestAttempt" class="version-status" :class="`version-status--${shot.latestAttempt.status}`">{{ renderStatusLabel(shot.latestAttempt.status) }}</span></header>
            <template v-if="shot.renderMode !== 'wan'">
              <video v-if="shot.latestAttempt?.hasVideo && renderUrls[shot.latestAttempt.id]" class="shot-render-preview" controls preload="metadata" :src="renderUrls[shot.latestAttempt.id]" />
              <div v-if="shot.latestAttempt && ['queued', 'rendering'].includes(shot.latestAttempt.status)" class="asset-job-progress"><v-progress-linear :model-value="shot.latestAttempt.progress" color="warning" /><small>{{ shot.latestAttempt.stage || 'QUEUED' }} · {{ shot.latestAttempt.progress }}%</small></div>
              <v-alert v-if="shot.latestAttempt?.status === 'failed'" density="compact" type="error" variant="tonal">{{ shot.latestAttempt.errorMessage || 'Falha no render 2D.' }}</v-alert>
              <div class="version-actions"><button v-if="!shot.latestAttempt" class="app-button app-button--secondary" type="button" :disabled="!shot.hasApprovedBackground" @click="renderShot(shot.id)">Renderizar tomada</button><button v-if="shot.latestAttempt?.status === 'failed'" class="app-button app-button--secondary" type="button" @click="retryShotRender(shot.latestAttempt.id)">Tentar novamente</button><button v-if="shot.latestAttempt?.status === 'completed'" class="app-button app-button--secondary" type="button" @click="renderShot(shot.id)">Nova versao</button></div>
              <details v-if="shot.latestAttempt?.renderManifest"><summary>Manifesto reproduzivel</summary><pre class="render-manifest">{{ JSON.stringify(shot.latestAttempt.renderManifest, null, 2) }}</pre></details>
            </template>
          </article>
        </div>
      </section>

      <section v-if="productionAssets?.summary.readyForAnimation" class="surface-card studio-width plan-panel output-panel">
        <div class="panel-heading"><div><p class="page-eyebrow">Etapas 6 a 9</p><h3>Tomadas especiais e clipe final</h3><p>Wan e opcional nas tomadas hibridas. O render final normaliza todas as fontes e aplica a musica original.</p></div></div>
        <div v-if="outputStatus?.heroShots.length" class="hero-shot-list">
          <article v-for="shot in outputStatus.heroShots" :key="shot.id" class="animation-shot-card">
            <header><div><strong>{{ shot.index + 1 }}. {{ shot.title }}</strong><small>{{ shot.renderMode === 'wan' ? 'Wan obrigatorio para esta tomada' : 'Wan opcional; a base 2D continua valida' }}</small></div><span v-if="shot.latestAttempt" class="version-status" :class="`version-status--${shot.latestAttempt.status}`">{{ shot.latestAttempt.status }}</span></header>
            <video v-if="shot.latestAttempt?.assetId && heroUrls[shot.latestAttempt.id]" class="shot-render-preview" controls preload="metadata" :src="heroUrls[shot.latestAttempt.id]" />
            <div v-if="shot.latestAttempt && ['queued', 'generating', 'validating'].includes(shot.latestAttempt.status)" class="asset-job-progress"><v-progress-linear :model-value="shot.latestAttempt.progress" color="warning" /><small>{{ shot.latestAttempt.stage }} · {{ shot.latestAttempt.progress }}%</small></div>
            <v-alert v-if="shot.latestAttempt?.status === 'failed'" type="error" variant="tonal" density="compact">{{ shot.latestAttempt.errorMessage }}</v-alert>
            <div class="version-actions"><button v-if="!shot.latestAttempt || ['ready_for_review', 'approved'].includes(shot.latestAttempt.status)" class="app-button app-button--secondary" type="button" @click="generateHeroShot(shot.id)">{{ shot.latestAttempt ? 'Gerar outra versao Wan' : 'Gerar tomada Wan' }}</button><button v-if="shot.latestAttempt?.status === 'ready_for_review'" class="app-button" type="button" @click="approveHeroShot(shot.latestAttempt.id)">Aprovar Wan</button><button v-if="shot.latestAttempt?.status === 'failed'" class="app-button app-button--secondary" type="button" @click="retryHeroShot(shot.latestAttempt.id)">Tentar novamente</button><span v-if="shot.latestAttempt?.status === 'approved'" class="approved-copy"><v-icon icon="mdi-lock-check" /> Wan aprovado</span></div>
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
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';
import AppLayout from '@/layouts/AppLayout.vue';
import { projectsService } from '@/services/projects.service';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';
import type { CharacterAssetRole, ChildrenClipAnimationStatus, ChildrenClipAudioStatus, ChildrenClipCharacter, ChildrenClipCharacterVersion, ChildrenClipOutputStatus, ChildrenClipPlanStatus, ChildrenClipProductionAssetsStatus, ChildrenClipShot, ChildrenClipShotAsset, ChildrenClipShotAssetRole, ChildrenClipShotRenderAttempt } from '@/types/project.types';

@Component({ components: { AppLayout } })
export default class ChildrenClipStudioPage extends Vue {
  characters: ChildrenClipCharacter[] = [];
  audioStatus: ChildrenClipAudioStatus | null = null;
  planStatus: ChildrenClipPlanStatus | null = null;
  productionAssets: ChildrenClipProductionAssetsStatus | null = null;
  animationStatus: ChildrenClipAnimationStatus | null = null;
  outputStatus: ChildrenClipOutputStatus | null = null;
  visualBibleJson = '';
  narrativeJson = '';
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
  assetUrls: Record<string, string> = {};
  assetRoles: Record<string, CharacterAssetRole> = {};
  versionFiles: Record<string, File | null> = {};
  pollTimer: ReturnType<typeof setInterval> | null = null;
  replacementTrack: File | null = null;
  replacingTrack = false;
  generatingBackgrounds = false;
  shotAssetUrls: Record<string, string> = {};
  shotAssetRoles: Record<string, ChildrenClipShotAssetRole> = {};
  shotAssetPrompts: Record<string, string> = {};
  shotAssetFiles: Record<string, File | null> = {};
  renderingMissingShots = false;
  renderUrls: Record<string, string> = {};
  heroUrls: Record<string, string> = {};
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
    if (!this.authStore.token) return;
    try {
      const project = await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      if (project.generationMode !== 'children_clip') { void this.$router.replace({ name: 'project-detail', params: { id: project.id } }); return; }
      await Promise.all([this.loadAudioAnalysis(), this.loadCharacters(), this.loadPlan()]);
      if (this.planStatus?.plan?.status === 'approved') {
        await this.loadProductionAssets();
        if (this.productionAssets?.summary.readyForAnimation) await Promise.all([this.loadAnimation(), this.loadOutput()]);
      }
      this.pollTimer = setInterval(() => void this.pollIfNeeded(), 4000);
    } catch (error) { this.captureError(error, 'Falha ao carregar o estudio'); }
  }

  beforeUnmount() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    Object.values(this.assetUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.shotAssetUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.renderUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.heroUrls).forEach((url) => URL.revokeObjectURL(url));
    if (this.finalRenderUrl) URL.revokeObjectURL(this.finalRenderUrl);
  }

  async loadCharacters() {
    if (!this.authStore.token) return;
    this.characters = await projectsService.listChildrenClipCharacters(this.projectId, this.authStore.token);
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
      const attempt = shot.latestAttempt;
      if (!attempt?.assetId || this.heroUrls[attempt.id]) continue;
      const blob = await projectsService.downloadChildrenClipHeroShot(this.projectId, attempt.id, this.authStore.token);
      this.heroUrls = { ...this.heroUrls, [attempt.id]: URL.createObjectURL(blob) };
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
    if (this.characters.some((item) => item.versions.some((version) => ['queued', 'generating'].includes(version.status)))) {
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
      if (this.assetUrls[asset.id]) continue;
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
  async uploadSupplementary(characterId: string, versionId: string) {
    if (!this.authStore.token || !this.versionFiles[versionId]) return;
    try {
      await projectsService.uploadChildrenClipCharacterAsset(this.projectId, characterId, versionId, this.versionFiles[versionId]!, this.assetRoles[versionId] ?? 'pose', '', this.authStore.token);
      this.versionFiles = { ...this.versionFiles, [versionId]: null };
      await this.loadCharacters();
    } catch (error) { this.captureError(error, 'Falha ao enviar imagem complementar'); }
  }

  statusLabel(status: ChildrenClipCharacterVersion['status']) { return ({ draft: 'Rascunho', queued: 'Enfileirada', generating: 'Gerando', ready_for_review: 'Revisar', approved: 'Aprovada', rejected: 'Rejeitada', failed: 'Falhou' })[status]; }
  originLabel(origin: ChildrenClipCharacterVersion['origin']) { return ({ generated: 'Gerada', uploaded: 'Enviada', hybrid: 'Hibrida' })[origin]; }
  roleLabel(role: CharacterAssetRole) { return ({ primary_reference: 'Referencia principal', front_view: 'Vista frontal', side_view: 'Vista lateral', back_view: 'Vista traseira', portrait: 'Retrato', expression: 'Expressao', pose: 'Pose', mouth_shape: 'Forma de boca', eye_state: 'Olhos', source_reference: 'Referencia original' })[role]; }
  async generatePlan() {
    if (!this.authStore.token) return;
    try { this.planStatus = await projectsService.generateChildrenClipProductionPlan(this.projectId, this.planRevision.trim() || null, this.authStore.token); this.planRevision = ''; } catch (error) { this.captureError(error, 'Falha ao iniciar planejamento'); }
  }
  async savePlanText() {
    if (!this.authStore.token) return;
    try {
      const visualBible = JSON.parse(this.visualBibleJson) as Record<string, unknown>;
      const narrative = JSON.parse(this.narrativeJson) as Record<string, unknown>;
      this.planStatus = await projectsService.updateChildrenClipProductionPlan(this.projectId, { visualBible, narrative }, this.authStore.token);
    } catch (error) { this.captureError(error, 'JSON invalido ou falha ao salvar o plano'); }
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
  async generateShotAsset(shotId: string) {
    if (!this.authStore.token) return;
    const role = (this.shotAssetRoles[shotId] || 'background') as Exclude<ChildrenClipShotAssetRole, 'character_pose'>;
    try { this.productionAssets = await projectsService.generateChildrenClipShotAsset(this.projectId, shotId, role, this.shotAssetPrompts[shotId] || null, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao gerar nova versao do asset'); }
  }
  async uploadShotAsset(shotId: string) {
    if (!this.authStore.token || !this.shotAssetFiles[shotId]) return;
    try { this.productionAssets = await projectsService.uploadChildrenClipShotAsset(this.projectId, shotId, this.shotAssetFiles[shotId]!, this.shotAssetRoles[shotId] || 'background', this.authStore.token); this.shotAssetFiles = { ...this.shotAssetFiles, [shotId]: null }; await this.loadShotAssetUrls(); } catch (error) { this.captureError(error, 'Falha ao enviar asset'); }
  }
  async approveShotAsset(assetId: string) { if (!this.authStore.token) return; try { this.productionAssets = await projectsService.approveChildrenClipShotAsset(this.projectId, assetId, this.authStore.token); if (this.productionAssets.summary.readyForAnimation) await Promise.all([this.loadAnimation(), this.loadOutput()]); } catch (error) { this.captureError(error, 'Falha ao aprovar asset'); } }
  async retryShotAsset(assetId: string) { if (!this.authStore.token) return; try { this.productionAssets = await projectsService.retryChildrenClipShotAsset(this.projectId, assetId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar geracao do asset'); } }
  shotAssetRoleLabel(role: ChildrenClipShotAssetRole) { return ({ background: 'Fundo', foreground: 'Primeiro plano', prop: 'Objeto', character_pose: 'Pose de personagem', storyboard_frame: 'Storyboard' })[role]; }
  shotAssetStatusLabel(status: ChildrenClipShotAsset['status']) { return ({ draft: 'Rascunho', queued: 'Enfileirado', generating: 'Gerando', ready_for_review: 'Revisar', approved: 'Aprovado', failed: 'Falhou' })[status]; }
  async renderMissingShots() { if (!this.authStore.token) return; this.renderingMissingShots = true; try { this.animationStatus = await projectsService.renderMissingChildrenClipShots(this.projectId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao enfileirar animacoes'); } finally { this.renderingMissingShots = false; } }
  async renderShot(shotId: string) { if (!this.authStore.token) return; try { this.animationStatus = await projectsService.renderChildrenClipShot(this.projectId, shotId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao enfileirar tomada 2D'); } }
  async retryShotRender(attemptId: string) { if (!this.authStore.token) return; try { this.animationStatus = await projectsService.retryChildrenClipShotRender(this.projectId, attemptId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar render 2D'); } }
  renderStatusLabel(status: ChildrenClipShotRenderAttempt['status']) { return ({ queued: 'Enfileirado', rendering: 'Renderizando', completed: 'Concluido', failed: 'Falhou' })[status]; }
  async generateHeroShot(shotId: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.generateChildrenClipHeroShot(this.projectId, shotId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao gerar tomada Wan'); } }
  async retryHeroShot(attemptId: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.retryChildrenClipHeroShot(this.projectId, attemptId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao reiniciar tomada Wan'); } }
  async approveHeroShot(attemptId: string) { if (!this.authStore.token) return; try { this.outputStatus = await projectsService.approveChildrenClipHeroShot(this.projectId, attemptId, this.authStore.token); } catch (error) { this.captureError(error, 'Falha ao aprovar tomada Wan'); } }
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
.production-assets-actions { display: flex; align-items: center; gap: 16px; margin: 18px 0; }
.production-shot-list { display: grid; gap: 16px; }
.shot-asset-card { padding: 16px; border: 1px solid #dfe3e8; border-radius: 14px; background: #fafbfc; }
.shot-asset-card > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shot-asset-card > header div { display: grid; gap: 3px; }
.shot-asset-card small, .shot-asset-card > header > span, .shot-asset-card > p { color: #65676b; }
.shot-assets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin: 14px 0; }
.shot-assets-grid figure { overflow: hidden; margin: 0; padding-bottom: 12px; border: 1px solid #dfe3e8; border-radius: 12px; background: #fff; }
.shot-assets-grid figure.shot-asset--approved { border-color: #67ae7d; box-shadow: 0 0 0 2px #dff3e5; }
.shot-assets-grid img, .shot-assets-grid .asset-loading { width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #f0f2f5; }
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
.final-render-preview { width: min(820px, 100%); max-height: 460px; border-radius: 14px; background: #111; }
.final-download { width: fit-content; text-decoration: none; }
@media (max-width: 700px) { .setup-grid, .character-form, .audio-metrics, .replace-track, .plan-json-grid, .shot-form { grid-template-columns: 1fr; } .character-form__wide, .shot-form__wide { grid-column: auto; } .character-panel, .character-card, .audio-panel, .plan-panel { padding: 18px; } .supplementary-assets__form, .shot-asset-form { grid-template-columns: 1fr; } .shot-card summary { align-items: flex-start; flex-direction: column; } }
</style>
