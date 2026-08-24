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
    </template>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';
import AppLayout from '@/layouts/AppLayout.vue';
import { projectsService } from '@/services/projects.service';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';
import type { CharacterAssetRole, ChildrenClipCharacter, ChildrenClipCharacterVersion } from '@/types/project.types';

@Component({ components: { AppLayout } })
export default class ChildrenClipStudioPage extends Vue {
  characters: ChildrenClipCharacter[] = [];
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

  get authStore(): any { return useAuthStore(); }
  get projectsStore(): any { return useProjectsStore(); }
  get project() { return this.projectsStore.currentProject; }
  get projectId() { return String(this.$route.params.id); }
  get productionStatusLabel() { return this.project?.childrenClip?.productionStatus === 'setup' ? 'Preparacao' : this.project?.childrenClip?.productionStatus; }
  get invariants() { return this.invariantsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }

  async mounted() {
    if (!this.authStore.token) return;
    try {
      const project = await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      if (project.generationMode !== 'children_clip') { void this.$router.replace({ name: 'project-detail', params: { id: project.id } }); return; }
      await this.loadCharacters();
      this.pollTimer = setInterval(() => void this.pollIfNeeded(), 4000);
    } catch (error) { this.captureError(error, 'Falha ao carregar o estudio'); }
  }

  beforeUnmount() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    Object.values(this.assetUrls).forEach((url) => URL.revokeObjectURL(url));
  }

  async loadCharacters() {
    if (!this.authStore.token) return;
    this.characters = await projectsService.listChildrenClipCharacters(this.projectId, this.authStore.token);
    await this.loadAssetUrls();
  }

  async pollIfNeeded() {
    if (this.characters.some((item) => item.versions.some((version) => ['queued', 'generating'].includes(version.status)))) {
      try { await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao atualizar personagens'); }
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

  onPrimaryFileSelected(event: Event) { this.primaryFile = (event.target as HTMLInputElement).files?.[0] ?? null; }
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
      await this.loadCharacters();
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
  async approveVersion(characterId: string, versionId: string) {
    if (!this.authStore.token) return;
    try { await projectsService.approveChildrenClipCharacterVersion(this.projectId, characterId, versionId, this.authStore.token); await this.loadCharacters(); } catch (error) { this.captureError(error, 'Falha ao aprovar versao'); }
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
@media (max-width: 700px) { .setup-grid, .character-form { grid-template-columns: 1fr; } .character-form__wide { grid-column: auto; } .character-panel, .character-card { padding: 18px; } .supplementary-assets__form { grid-template-columns: 1fr; } }
</style>
