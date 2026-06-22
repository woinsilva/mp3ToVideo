<template>
  <v-main class="auth-shell">
    <v-container class="fill-height">
      <v-row align="center" justify="center">
        <v-col cols="12" md="8" lg="5">
          <div class="auth-panel">
            <p class="page-eyebrow">Video SaaS MVP</p>
            <h1 class="page-title">{{ title }}</h1>
            <p class="page-subtitle">{{ subtitle }}</p>
            <slot />
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
