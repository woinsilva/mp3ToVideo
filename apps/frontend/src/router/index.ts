import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import DashboardPage from '@/pages/DashboardPage.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: DashboardPage
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
