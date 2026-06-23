<template>
  <v-card class="surface-card" rounded="xl">
    <v-card-text class="d-flex flex-column ga-4">
      <div>
        <h3 class="section-title">Upload do audio</h3>
        <p class="section-copy">
          Aceita arquivos `.mp3` e `.wav`. O processamento comeca assim que o upload terminar.
        </p>
      </div>

      <label class="auth-input-group">
        <span class="auth-input-label">Escolha o arquivo de audio</span>
        <input class="app-file-input" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav" @change="onFileChange" />
      </label>

      <div class="upload-file-meta" v-if="selectedFile">
        <strong>Arquivo selecionado:</strong>
        <span>{{ selectedFile.name }}</span>
      </div>

      <button class="app-button" type="button" :disabled="!selectedFile || loading" @click="emitUpload">
        {{ loading ? loadingLabel : submitLabel }}
      </button>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

@Component({
  emits: ['upload']
})
export default class FileUploadCard extends Vue {
  @Prop({ default: false })
  readonly loading!: boolean;

  @Prop({ default: 'Enviar MP3' })
  readonly submitLabel!: string;

  @Prop({ default: 'Enviando MP3...' })
  readonly loadingLabel!: string;

  selectedFile: File | null = null;

  onFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.selectedFile = target.files?.[0] ?? null;
  }

  emitUpload() {
    if (!this.selectedFile) {
      return;
    }

    this.$emit('upload', this.selectedFile);
    this.selectedFile = null;
  }
}
</script>
