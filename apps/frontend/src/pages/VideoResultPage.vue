<template>
  <AppLayout>
    <section class="hero-banner">
      <div>
        <p class="page-eyebrow">Resultado</p>
        <h2 class="page-title">{{ projectTitle }}</h2>
        <p class="page-subtitle">Player do MP4 final e lista das cenas geradas pelo pipeline.</p>
      </div>
    </section>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <v-row>
      <v-col cols="12" lg="7">
        <VideoPreview :video-url="videoUrl" :loading="loading" @download="downloadVideo" />
      </v-col>
      <v-col cols="12" lg="5">
        <ProjectStatusTimeline
          v-if="statusPayload"
          :status="statusPayload.status"
          :progress="statusPayload.progress"
          :current-step="statusPayload.currentStep"
          :error-message="statusPayload.errorMessage"
        />
      </v-col>
    </v-row>

    <section class="mt-6">
      <SceneList :scenes="scenes" />
    </section>
  </AppLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import ProjectStatusTimeline from '@/components/ProjectStatusTimeline.vue';
import SceneList from '@/components/SceneList.vue';
import VideoPreview from '@/components/VideoPreview.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useProjectsStore } from '@/stores/projects.store';

@Component({
  components: {
    AppLayout,
    ProjectStatusTimeline,
    SceneList,
    VideoPreview
  }
})
export default class VideoResultPage extends Vue {
  videoUrl: string | null = null;
  loading = false;
  errorMessage: string | null = null;

  get authStore(): any {
    return useAuthStore();
  }

  get projectsStore(): any {
    return useProjectsStore();
  }

  get projectId(): string {
    return String(this.$route.params.id);
  }

  get projectTitle(): string {
    return this.projectsStore.currentProject?.title ?? 'Projeto';
  }

  get statusPayload() {
    return this.projectsStore.currentStatus;
  }

  get scenes() {
    return this.projectsStore.currentScenes;
  }

  async mounted() {
    await this.loadPage();
  }

  beforeUnmount() {
    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
      this.videoUrl = null;
    }
  }

  async loadPage() {
    if (!this.authStore.token) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    try {
      await this.projectsStore.fetchProject(this.projectId, this.authStore.token);
      await this.projectsStore.fetchStatus(this.projectId, this.authStore.token);
      await this.projectsStore.fetchRender(this.projectId, this.authStore.token);
      await this.projectsStore.fetchScenes(this.projectId, this.authStore.token);
      await this.loadVideoBlob();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao carregar resultado';
    } finally {
      this.loading = false;
    }
  }

  async loadVideoBlob() {
    if (!this.authStore.token) {
      return;
    }

    const blob = await this.projectsStore.downloadRender(this.projectId, this.authStore.token);

    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
    }

    this.videoUrl = URL.createObjectURL(blob);
  }

  async downloadVideo() {
    if (!this.authStore.token) {
      return;
    }

    const blob = await this.projectsStore.downloadRender(this.projectId, this.authStore.token);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.projectId}.mp4`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
</script>
