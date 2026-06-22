<template>
  <v-main class="auth-shell">
    <v-container class="fill-height">
      <v-row align="center" justify="center">
        <v-col cols="12" lg="10">
          <div class="auth-grid">
            <section class="auth-panel auth-panel--form">
              <slot />
            </section>

            <section class="auth-panel auth-panel--hero">
              <p class="page-eyebrow">Video SaaS MVP</p>
              <h1 class="page-title">{{ title }}</h1>
              <p class="page-subtitle">{{ subtitle }}</p>

              <div class="auth-feature-list">
                <div class="auth-feature-item">
                  <strong>1. Envie o MP3</strong>
                  <span>Upload simples com rastreamento de projeto.</span>
                </div>
                <div class="auth-feature-item">
                  <strong>2. Processe em fila</strong>
                  <span>Pipeline assincrono para storyboard, cenas e render.</span>
                </div>
                <div class="auth-feature-item">
                  <strong>3. Baixe o MP4</strong>
                  <span>Resultado final sincronizado para revisao e download.</span>
                </div>
              </div>

              <div class="auth-demo-box">
                <span class="auth-demo-label">Conta demo</span>
                <strong>demo@example.com</strong>
                <span>Senha: 12345678</span>
              </div>
            </section>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </v-main>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-facing-decorator';

@Component
export default class AuthLayout extends Vue {
  @Prop({ required: true })
  readonly title!: string;

  @Prop({ required: true })
  readonly subtitle!: string;
}
</script>
