<template>
  <v-main class="auth-shell">
    <v-container class="fill-height auth-container">
      <v-row align="center" justify="center">
        <v-col cols="12" sm="10" md="7" lg="4">
          <div class="auth-panel auth-panel--simple">
            <p class="page-eyebrow">Video SaaS MVP</p>
            <h1 class="auth-simple-title">{{ title }}</h1>
            <p class="auth-simple-subtitle">{{ subtitle }}</p>
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
