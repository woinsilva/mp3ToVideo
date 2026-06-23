<template>
  <v-card class="surface-card" rounded="xl">
    <v-card-text class="d-flex flex-column ga-4">
      <div class="d-flex justify-space-between align-center flex-wrap ga-3">
        <div>
          <h3 class="section-title">Videoclipe final</h3>
          <p class="section-copy">Preview do MP4 final gerado pelo pipeline.</p>
        </div>
        <button
          class="app-button"
          type="button"
          :disabled="!videoUrl || loading"
          @click="$emit('download')"
        >
          {{ loading ? 'Preparando download...' : 'Baixar MP4' }}
        </button>
      </div>

      <div class="video-frame">
        <video v-if="videoUrl" :src="videoUrl" controls class="video-element" />
        <div v-else class="video-placeholder">
          O preview do video aparece aqui quando o render estiver pronto.
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
