<template>
  <v-main class="app-shell">
    <div class="app-frame">
      <aside class="app-sidebar">
        <div class="brand">
          <span class="brand-mark"><v-icon icon="mdi-movie-open-play" size="24" /></span>
          <span class="brand-copy">
            <span class="brand-name">ClipForge</span>
            <span class="brand-tagline">Música em movimento</span>
          </span>
        </div>

        <nav class="sidebar-nav" aria-label="Navegação principal">
          <button
            class="nav-button"
            :class="{ active: isDashboardRoute }"
            type="button"
            @click="goToDashboard"
          >
            <v-icon icon="mdi-view-dashboard-outline" size="22" />
            <span>Meus videoclipes</span>
          </button>
          <button
            class="nav-button"
            :class="{ active: isCreateRoute }"
            type="button"
            @click="goToCreateProject"
          >
            <v-icon icon="mdi-plus-box-outline" size="22" />
            <span>Criar videoclipe</span>
          </button>
        </nav>

        <div class="sidebar-footer">
          <div class="user-card">
            <span class="user-avatar">{{ userInitial }}</span>
            <span class="user-meta">
              <strong>{{ userName || 'Usuário' }}</strong>
              <span>{{ organizationName || 'Workspace' }}</span>
            </span>
            <v-btn
              aria-label="Sair"
              icon="mdi-logout"
              size="small"
              variant="text"
              @click="logout"
            />
          </div>
        </div>
      </aside>

      <div class="app-content">
        <header class="app-topbar">
          <div class="brand mobile-brand">
            <span class="brand-mark"><v-icon icon="mdi-movie-open-play" size="22" /></span>
            <span class="brand-copy">
              <span class="brand-name">ClipForge</span>
            </span>
          </div>
          <div class="topbar-context">
            <strong>{{ organizationName || 'Sua workspace' }}</strong>
            <span>Crie, acompanhe e exporte seus videoclipes</span>
          </div>
          <div class="topbar-actions">
            <button class="app-button" type="button" @click="goToCreateProject">
              <v-icon icon="mdi-plus" size="20" />
              <span>Novo videoclipe</span>
            </button>
            <v-btn
              class="d-lg-none"
              aria-label="Sair"
              icon="mdi-logout"
              variant="text"
              @click="logout"
            />
          </div>
        </header>

        <main class="page-container">
          <slot />
        </main>
      </div>
    </div>
    <AssistantChat />
  </v-main>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

import { useAuthStore } from '@/stores/auth.store';
import AssistantChat from '@/components/AssistantChat.vue';

@Component({ components: { AssistantChat } })
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

  get userInitial(): string {
    return (this.userName || 'U').trim().charAt(0).toUpperCase();
  }

  get isDashboardRoute(): boolean {
    return this.$route.name === 'dashboard';
  }

  get isCreateRoute(): boolean {
    return this.$route.name === 'create-project';
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
