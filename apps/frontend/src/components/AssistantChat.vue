<template>
  <button v-if="!open" class="assistant-launcher" type="button" aria-label="Abrir assistente Qwen" @click="open = true">
    <v-icon icon="mdi-message-processing-outline" size="24" />
    <span>Assistente</span>
  </button>

  <aside v-else class="assistant-panel" aria-label="Assistente Qwen">
    <header class="assistant-header">
      <div>
        <span class="assistant-avatar"><v-icon icon="mdi-creation-outline" /></span>
        <div><strong>Assistente Qwen</strong><small>Contexto: {{ pageTitle }}</small></div>
      </div>
      <v-btn aria-label="Fechar assistente" icon="mdi-close" size="small" variant="text" @click="open = false" />
    </header>

    <div ref="messageList" class="assistant-messages" aria-live="polite">
      <div v-if="!messages.length" class="assistant-empty">
        <v-icon icon="mdi-lightbulb-on-outline" size="32" />
        <strong>Como posso ajudar nesta tela?</strong>
        <p>Peça ajuda para melhorar prompts, planejar cenas, revisar JSON ou tirar qualquer dúvida.</p>
        <div class="assistant-suggestions">
          <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="draft = suggestion">{{ suggestion }}</button>
        </div>
      </div>
      <article v-for="(message, index) in messages" :key="index" class="assistant-message" :class="`assistant-message--${message.role}`">
        <span>{{ message.role === 'user' ? 'Você' : 'Qwen' }}</span>
        <p>{{ message.content }}</p>
        <button v-if="message.role === 'assistant'" class="assistant-copy" type="button" @click="copyMessage(message.content)">
          <v-icon icon="mdi-content-copy" size="15" /> Copiar
        </button>
      </article>
      <div v-if="sending" class="assistant-thinking">
        <v-progress-circular indeterminate size="18" width="2" />
        <span>{{ waitingLabel }}</span>
      </div>
    </div>

    <v-alert v-if="errorMessage" class="assistant-error" type="error" density="compact" variant="tonal" closable @click:close="errorMessage = ''">{{ errorMessage }}</v-alert>
    <footer class="assistant-composer">
      <textarea v-model="draft" rows="3" maxlength="8000" placeholder="Pergunte ao Qwen..." :disabled="sending" @keydown.enter.exact.prevent="send" />
      <div>
        <button v-if="messages.length" class="assistant-clear" type="button" :disabled="sending" @click="clearHistory">Limpar conversa</button>
        <small>{{ draft.length }}/8000</small>
        <button class="assistant-send" type="button" :disabled="sending || !draft.trim()" @click="send" aria-label="Enviar mensagem">
          <v-icon icon="mdi-send" size="19" />
        </button>
      </div>
    </footer>
  </aside>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-facing-decorator';

import { assistantService, type AssistantMessage } from '@/services/assistant.service';
import { useAuthStore } from '@/stores/auth.store';

@Component
export default class AssistantChat extends Vue {
  open = false;
  draft = '';
  sending = false;
  errorMessage = '';
  waitingLabel = 'Aguardando a GPU e preparando a resposta...';
  messages: AssistantMessage[] = [];
  private waitingTimer: ReturnType<typeof setTimeout> | null = null;

  get authStore(): any { return useAuthStore(); }
  get pageTitle() { return String(this.$route.meta?.title || this.$route.name || 'ClipForge'); }
  get storageKey() { return `clipforge-assistant:${this.authStore.user?.id || 'current'}`; }
  get suggestions() {
    return ['Melhore este prompt de cena:', 'Ajude a planejar uma tomada infantil', 'Revise este JSON e encontre problemas:'];
  }

  mounted() { this.loadHistory(); }
  beforeUnmount() { if (this.waitingTimer) clearTimeout(this.waitingTimer); }

  @Watch('$route.fullPath')
  onRouteChanged() { this.scrollToBottom(); }

  async send() {
    const content = this.draft.trim();
    if (!content || this.sending || !this.authStore.token) return;
    this.messages.push({ role: 'user', content });
    this.messages = this.messages.slice(-20);
    this.draft = '';
    this.sending = true;
    this.errorMessage = '';
    this.waitingLabel = 'Aguardando a GPU e preparando a resposta...';
    this.waitingTimer = setTimeout(() => { this.waitingLabel = 'O Qwen está processando. Se a GPU estiver ocupada, o chat aguardará sem interromper a geração.'; }, 8000);
    this.persistHistory();
    this.scrollToBottom();
    try {
      const response = await assistantService.chat(this.messages, {
        routeName: String(this.$route.name || ''),
        pageTitle: this.pageTitle,
        projectId: typeof this.$route.params.id === 'string' ? this.$route.params.id : undefined
      }, this.authStore.token);
      this.messages.push({ role: 'assistant', content: response.content });
      this.messages = this.messages.slice(-20);
      this.persistHistory();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Falha ao consultar o Qwen.';
    } finally {
      if (this.waitingTimer) clearTimeout(this.waitingTimer);
      this.waitingTimer = null;
      this.sending = false;
      this.scrollToBottom();
    }
  }

  clearHistory() {
    this.messages = [];
    this.errorMessage = '';
    window.localStorage.removeItem(this.storageKey);
  }

  async copyMessage(content: string) {
    try { await navigator.clipboard.writeText(content); }
    catch { this.errorMessage = 'Não foi possível copiar a resposta.'; }
  }

  private loadHistory() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(this.storageKey) || '[]') as AssistantMessage[];
      this.messages = Array.isArray(stored)
        ? stored.filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string').slice(-20)
        : [];
    } catch { window.localStorage.removeItem(this.storageKey); }
  }

  private persistHistory() { window.localStorage.setItem(this.storageKey, JSON.stringify(this.messages.slice(-20))); }
  private scrollToBottom() { void this.$nextTick(() => { const list = this.$refs.messageList as HTMLElement | undefined; if (list) list.scrollTop = list.scrollHeight; }); }
}
</script>

<style scoped>
.assistant-launcher { position: fixed; right: 24px; bottom: 24px; z-index: 55; display: flex; align-items: center; gap: 8px; padding: 13px 18px; border: 0; border-radius: 999px; color: #fff; background: #0866ff; box-shadow: 0 12px 35px rgba(8, 102, 255, .32); font-weight: 800; cursor: pointer; }
.assistant-panel { position: fixed; inset: 16px 16px 16px auto; z-index: 60; display: grid; width: min(410px, calc(100vw - 24px)); grid-template-rows: auto minmax(0, 1fr) auto auto; overflow: hidden; border: 1px solid #dfe3e8; border-radius: 18px; background: #fff; box-shadow: 0 18px 60px rgba(28, 30, 33, .22); }
.assistant-header { display: flex; align-items: center; justify-content: space-between; padding: 15px 14px; border-bottom: 1px solid #e7e9ed; }
.assistant-header > div { display: flex; align-items: center; gap: 10px; }
.assistant-header strong, .assistant-header small { display: block; }
.assistant-header small { max-width: 260px; overflow: hidden; color: #65676b; font-size: .73rem; text-overflow: ellipsis; white-space: nowrap; }
.assistant-avatar { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 12px; color: #0866ff; background: #e7f3ff; }
.assistant-messages { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding: 16px; background: #f6f7f9; }
.assistant-empty { margin: auto 0; padding: 18px; text-align: center; color: #65676b; }
.assistant-empty strong { display: block; margin: 8px 0 4px; color: #1c1e21; }
.assistant-empty p { margin: 0 0 14px; font-size: .85rem; }
.assistant-suggestions { display: grid; gap: 7px; }
.assistant-suggestions button { padding: 9px 11px; border: 1px solid #dbe6f5; border-radius: 10px; color: #075ce5; background: #fff; text-align: left; cursor: pointer; }
.assistant-message { position: relative; max-width: 92%; padding: 10px 12px; border-radius: 14px; background: #fff; box-shadow: 0 1px 3px rgba(28, 30, 33, .08); }
.assistant-message--user { align-self: flex-end; color: #fff; background: #0866ff; }
.assistant-message > span { display: block; margin-bottom: 3px; font-size: .68rem; font-weight: 800; opacity: .72; }
.assistant-message p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .87rem; line-height: 1.48; }
.assistant-copy { margin-top: 8px; padding: 3px 0; border: 0; color: #65676b; background: transparent; font-size: .72rem; cursor: pointer; }
.assistant-thinking { display: flex; align-items: center; gap: 8px; color: #65676b; font-size: .78rem; }
.assistant-error { margin: 8px 12px 0; }
.assistant-composer { padding: 12px; border-top: 1px solid #e7e9ed; background: #fff; }
.assistant-composer textarea { width: 100%; resize: vertical; min-height: 70px; max-height: 180px; padding: 10px 12px; border: 1px solid #ccd3dc; border-radius: 12px; outline: none; }
.assistant-composer textarea:focus { border-color: #0866ff; box-shadow: 0 0 0 3px rgba(8, 102, 255, .12); }
.assistant-composer > div { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.assistant-composer small { margin-left: auto; color: #8a8d91; }
.assistant-clear { border: 0; color: #65676b; background: transparent; font-size: .75rem; cursor: pointer; }
.assistant-send { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; border: 0; border-radius: 10px; color: #fff; background: #0866ff; cursor: pointer; }
.assistant-send:disabled { opacity: .45; cursor: default; }
@media (max-width: 600px) { .assistant-panel { inset: 8px; width: auto; } .assistant-launcher span { display: none; } .assistant-launcher { right: 16px; bottom: 16px; padding: 14px; } }
</style>
