import 'reflect-metadata';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import './styles/main.scss';

import { createApp } from 'vue';

import App from './App.vue';
import { pinia } from './plugins/pinia';
import { router } from './plugins/router';
import { vuetify } from './plugins/vuetify';

createApp(App).use(pinia).use(router).use(vuetify).mount('#app');
