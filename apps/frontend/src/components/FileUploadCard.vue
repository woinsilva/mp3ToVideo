<template>
  <section class="surface-card upload-card">
    <div class="d-flex flex-column ga-4">
      <div class="upload-heading">
        <span class="upload-heading__icon"><v-icon icon="mdi-music-note-plus" size="26" /></span>
        <div>
          <h3 class="section-title">Escolha sua música</h3>
          <p class="section-copy">Use um arquivo MP3 ou WAV. Tamanho máximo de 50 MB.</p>
        </div>
      </div>

      <label
        class="upload-dropzone"
        :class="{ 'upload-dropzone--active': dragging, 'upload-dropzone--selected': selectedFile }"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input
          class="upload-native-input"
          type="file"
          accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
          @change="onFileChange"
        />
        <template v-if="selectedFile">
          <span class="upload-file-icon"><v-icon icon="mdi-file-music-outline" size="32" /></span>
          <strong>{{ selectedFile.name }}</strong>
          <span>{{ formatFileSize(selectedFile.size) }} · Clique para trocar</span>
        </template>
        <template v-else>
          <span class="upload-cloud-icon"><v-icon icon="mdi-cloud-upload-outline" size="34" /></span>
          <strong>Arraste sua música aqui</strong>
          <span>ou clique para escolher um arquivo</span>
        </template>
      </label>

      <button class="app-button app-button--large" type="button" :disabled="!selectedFile || loading" @click="emitUpload">
        <v-progress-circular v-if="loading" indeterminate size="18" width="2" />
        <v-icon v-else icon="mdi-arrow-right" size="20" />
        {{ loading ? loadingLabel : submitLabel }}
      </button>

      <p class="upload-note">
        <v-icon icon="mdi-shield-check-outline" size="17" />
        Seu arquivo é usado apenas para gerar este videoclipe.
      </p>
    </div>
  </section>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

@Component({
  emits: ['upload']
})
export default class FileUploadCard extends Vue {
  @Prop({ default: false })
  readonly loading!: boolean;

  @Prop({ default: 'Enviar música e começar' })
  readonly submitLabel!: string;

  @Prop({ default: 'Enviando música...' })
  readonly loadingLabel!: string;

  selectedFile: File | null = null;
  dragging = false;

  onFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.selectedFile = target.files?.[0] ?? null;
  }

  onDrop(event: DragEvent) {
    this.dragging = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file && this.isAcceptedFile(file)) this.selectedFile = file;
  }

  isAcceptedFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension === 'mp3' || extension === 'wav';
  }

  formatFileSize(bytes: number): string {
    return bytes >= 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  emitUpload() {
    if (!this.selectedFile) return;
    this.$emit('upload', this.selectedFile);
  }
}
</script>

<style scoped>
.upload-card {
  overflow: hidden;
  padding: 24px;
}

.upload-heading {
  display: flex;
  align-items: flex-start;
  gap: 13px;
}

.upload-heading__icon {
  display: inline-flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 12px;
  color: #0866ff;
  background: #e7f3ff;
}

.upload-dropzone {
  display: flex;
  min-height: 210px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex-direction: column;
  border: 2px dashed #b7bec8;
  border-radius: 14px;
  color: #65676b;
  background: #f7f8fa;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.upload-dropzone:hover,
.upload-dropzone--active {
  border-color: #0866ff;
  background: #eef5ff;
}

.upload-dropzone--selected {
  border-style: solid;
  border-color: #a9caff;
  background: #f4f8ff;
}

.upload-dropzone strong {
  color: #1c1e21;
}

.upload-native-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.upload-cloud-icon,
.upload-file-icon {
  display: inline-flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  margin-bottom: 5px;
  border-radius: 50%;
  color: #0866ff;
  background: #e7f3ff;
}

.upload-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: -4px 0 0;
  color: #65676b;
  font-size: 0.78rem;
}

@media (max-width: 600px) {
  .upload-card {
    padding: 18px;
  }
}
</style>
