<template>
  <v-app>
    <v-main class="app-shell">
      <v-container class="fill-height">
        <v-row align="center" justify="center">
          <v-col cols="12" md="10" lg="8">
            <section class="hero-panel">
              <p class="eyebrow">Video SaaS MVP</p>
              <h1 class="hero-title">{{ headline }}</h1>
              <p class="hero-copy">
                Esta base valida o Modulo 1: frontend Vue 3, API NestJS, worker NestJS,
                PostgreSQL e Redis preparados para o pipeline do videoclipe.
              </p>

              <div class="hero-actions">
                <v-btn color="primary" size="x-large" rounded="pill">
                  Iniciar projeto
                </v-btn>
                <v-chip color="secondary" size="large" variant="outlined">
                  Base pronta para pipeline assincrona
                </v-chip>
              </div>
            </section>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

@Component
export default class DashboardPage extends Vue {
  get headline(): string {
    return 'Upload entra aqui. O MP4 vai sair do outro lado.';
  }
}
</script>
