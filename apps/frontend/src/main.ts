import 'reflect-metadata';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import './styles/main.scss';

import { createApp } from 'vue';

import App from './App.vue';
import { pinia } from './plugins/pinia';
import { router } from './plugins/router';
import { vuetify } from './plugins/vuetify';
import { apiService } from './services/api.service';
import { useAuthStore } from './stores/auth.store';

apiService.setUnauthorizedHandler(() => {
  const authStore = useAuthStore(pinia);
  authStore.logout();

  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login' });
  }
});

createApp(App).use(pinia).use(router).use(vuetify).mount('#app');
