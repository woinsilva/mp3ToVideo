<template>
  <v-main class="auth-shell">
    <section class="auth-visual">
      <div class="brand">
        <span class="brand-mark"><v-icon icon="mdi-movie-open-play" size="24" /></span>
        <span class="brand-copy">
          <span class="brand-name">ClipForge</span>
          <span class="brand-tagline">Música em movimento</span>
        </span>
      </div>

      <div class="auth-visual-copy">
        <h1>Transforme sua música em um videoclipe.</h1>
        <p>
          Envie o áudio, acompanhe a criação das cenas e receba um vídeo pronto para
          compartilhar.
        </p>
      </div>

      <small class="auth-visual-footer">Geração local com privacidade e controle.</small>
    </section>

    <section class="auth-main">
      <div class="auth-container">
        <div class="auth-panel auth-panel--simple">
          <div>
            <p class="page-eyebrow">Bem-vindo</p>
            <h1 class="auth-simple-title">{{ title }}</h1>
            <p class="auth-simple-subtitle">{{ subtitle }}</p>
          </div>
          <slot />
        </div>
      </div>
    </section>
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
