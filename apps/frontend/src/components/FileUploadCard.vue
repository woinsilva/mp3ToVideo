<template>
  <v-card class="surface-card" rounded="xl">
    <v-card-text class="d-flex flex-column ga-4">
      <div>
        <h3 class="section-title">Upload do MP3</h3>
        <p class="section-copy">
          Aceita apenas arquivos `.mp3`. O processamento será disparado assim que o upload terminar.
        </p>
      </div>

      <v-file-input
        v-model="selectedFile"
        accept=".mp3,audio/mpeg"
        label="Escolha o arquivo MP3"
        prepend-icon="mdi-music"
        variant="outlined"
        show-size
      />

      <v-btn
        color="primary"
        size="large"
        prepend-icon="mdi-upload"
        :disabled="!selectedFile || loading"
        :loading="loading"
        @click="emitUpload"
      >
        Enviar MP3
      </v-btn>
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

  selectedFile: File | null = null;

  emitUpload() {
    if (!this.selectedFile) {
      return;
    }

    this.$emit('upload', this.selectedFile);
  }
}
</script>
