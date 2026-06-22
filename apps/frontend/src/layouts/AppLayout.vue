<template>
  <v-main class="app-shell">
    <v-container class="py-6">
      <header class="topbar">
        <div>
          <p class="page-eyebrow">Video SaaS MVP</p>
          <h1 class="topbar-title">MP3 para videoclipe</h1>
        </div>
        <div class="topbar-actions">
          <div class="workspace-meta" v-if="organizationName">
            <strong>{{ organizationName }}</strong>
            <span>{{ userName }}</span>
          </div>
          <v-btn variant="text" prepend-icon="mdi-view-dashboard" @click="goToDashboard">
            Dashboard
          </v-btn>
          <v-btn color="primary" prepend-icon="mdi-plus" @click="goToCreateProject">
            Novo projeto
          </v-btn>
          <v-btn variant="outlined" prepend-icon="mdi-logout" @click="logout">
            Sair
          </v-btn>
        </div>
      </header>
      <slot />
    </v-container>
  </v-main>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import { useAuthStore } from '@/stores/auth.store';

@Component
export default class AppLayout extends Vue {
  get authStore(): any {
    return useAuthStore();
  }

  get organizationName(): string {
    return this.authStore.organization?.name ?? '';
  }

  get userName(): string {
    return this.authStore.user?.name ?? '';
  }

  goToDashboard() {
    void this.$router.push({ name: 'dashboard' });
  }

  goToCreateProject() {
    void this.$router.push({ name: 'create-project' });
  }

  logout() {
    this.authStore.logout();
    void this.$router.push({ name: 'login' });
  }
}
</script>
