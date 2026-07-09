<template>
  <v-card class="surface-card video-card" rounded="xl">
    <v-card-text class="d-flex flex-column ga-4">
      <div class="d-flex justify-space-between align-center flex-wrap ga-3">
        <div>
          <p class="page-eyebrow">Pronto para assistir</p>
          <h3 class="section-title">Seu videoclipe</h3>
          <p class="section-copy">Assista ao resultado e baixe o arquivo em MP4.</p>
        </div>
        <button
          class="app-button"
          type="button"
          :disabled="!videoUrl || loading"
          @click="$emit('download')"
        >
          <v-icon icon="mdi-download" size="19" />
          {{ loading ? 'Preparando...' : 'Baixar MP4' }}
        </button>
      </div>

      <div class="video-frame">
        <video v-if="videoUrl" :src="videoUrl" controls class="video-element" />
        <div v-else class="video-placeholder">
          <v-progress-circular v-if="loading" indeterminate color="primary" />
          <span v-else>O vídeo aparecerá aqui quando estiver pronto.</span>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

@Component({
  emits: ['download']
})
export default class VideoPreview extends Vue {
  @Prop({ default: null })
  readonly videoUrl!: string | null;

  @Prop({ default: false })
  readonly loading!: boolean;
}
</script>

<style scoped>
.video-card {
  padding: 8px;
}

.video-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-direction: column;
}
</style>
