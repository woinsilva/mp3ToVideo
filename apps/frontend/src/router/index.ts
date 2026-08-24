import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import CreateProjectPage from '@/pages/CreateProjectPage.vue';
import CreateChildrenClipPage from '@/pages/CreateChildrenClipPage.vue';
import ChildrenClipStudioPage from '@/pages/ChildrenClipStudioPage.vue';
import DashboardPage from '@/pages/DashboardPage.vue';
import LoginPage from '@/pages/LoginPage.vue';
import ProcessingPage from '@/pages/ProcessingPage.vue';
import ProjectDetailPage from '@/pages/ProjectDetailPage.vue';
import RegisterPage from '@/pages/RegisterPage.vue';
import VideoResultPage from '@/pages/VideoResultPage.vue';
import { useAuthStore } from '@/stores/auth.store';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { guestOnly: true }
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterPage,
    meta: { guestOnly: true }
  },
  {
    path: '/',
    name: 'dashboard',
    component: DashboardPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/projects/new',
    name: 'create-project',
    component: CreateProjectPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/projects/new/children-clip',
    name: 'create-children-clip',
    component: CreateChildrenClipPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/projects/:id/children-clip',
    name: 'children-clip-studio',
    component: ChildrenClipStudioPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/projects/:id',
    name: 'project-detail',
    component: ProjectDetailPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/projects/:id/processing',
    name: 'processing',
    component: ProcessingPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/projects/:id/result',
    name: 'video-result',
    component: VideoResultPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: () => {
      const authStore = useAuthStore();
      authStore.hydrateFromStorage();
      return authStore.isAuthenticated ? { name: 'dashboard' } : { name: 'login' };
    }
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  authStore.hydrateFromStorage();

  if (authStore.token && !authStore.user) {
    try {
      await authStore.bootstrapSession();
    } catch {
      authStore.logout();
    }
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' };
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: 'dashboard' };
  }

  return true;
});
