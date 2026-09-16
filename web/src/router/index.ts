import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { public: true } },
    {
      path: '/',
      component: () => import('@/views/LayoutView.vue'),
      redirect: '/dashboard',
      children: [
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '实时总览' } },
        { path: 'devices', name: 'devices', component: () => import('@/views/DevicesView.vue'), meta: { title: '设备管理' } },
        { path: 'history', name: 'history', component: () => import('@/views/HistoryView.vue'), meta: { title: '历史数据' } },
        { path: 'alerts', name: 'alerts', component: () => import('@/views/AlertsView.vue'), meta: { title: '告警中心' } },
        { path: 'algorithm', name: 'algorithm', component: () => import('@/views/AlgorithmView.vue'), meta: { title: '算法效果对比' } },
      ],
    },
    // 全屏大屏（无侧边栏，独立路由）
    { path: '/big', name: 'big', component: () => import('@/views/DashboardBigView.vue'), meta: { public: true, fullscreen: true } },
  ],
})

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }
  next()
})

router.afterEach((to) => {
  if (to.meta.fullscreen) {
    document.documentElement.requestFullscreen?.().catch(() => {})
  }
})

export default router