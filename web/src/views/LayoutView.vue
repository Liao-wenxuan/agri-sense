<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRealtimeStore } from '@/stores/realtime'
import { useThemeStore } from '@/stores/theme'

const auth = useAuthStore()
const rt = useRealtimeStore()
const theme = useThemeStore()
const router = useRouter()

onMounted(() => rt.connect())
onUnmounted(() => rt.disconnect())

const menuItems = [
  { path: '/dashboard', label: 'Dashboard', icon: 'DataLine' },
  { path: '/devices',   label: '设备管理', icon: 'Cpu' },
  { path: '/history',   label: '历史数据', icon: 'Histogram' },
  { path: '/alerts',    label: '告警中心', icon: 'Warning' },
  { path: '/algorithm', label: '算法对比', icon: 'MagicStick' },
]

const activeMenu = computed(() => router.currentRoute.value.path)
const isDark = computed(() => theme.mode === 'dark')

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="app-layout">
    <el-container style="height:100vh">
      <!-- 侧边栏：浅色/深色两种主题 -->
      <el-aside
        width="220px"
        :style="{
          background: isDark ? '#0d1117' : '#1e293b',
          color: '#fff',
          transition: 'background-color 0.25s ease',
        }"
      >
        <div style="padding:24px 16px;font-size:18px;font-weight:700;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.1)">
          🌱 AgriSense
        </div>
        <el-menu
          :default-active="activeMenu"
          router
          :background-color="isDark ? '#0d1117' : '#1e293b'"
          text-color="#cbd5e1"
          active-text-color="#22c55e"
          style="border:none"
        >
          <el-menu-item v-for="m in menuItems" :key="m.path" :index="m.path">
            <el-icon><component :is="m.icon" /></el-icon>
            <span>{{ m.label }}</span>
          </el-menu-item>
        </el-menu>
        <div style="position:absolute;bottom:0;width:220px;padding:14px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;font-size:13px">
          <span style="display:flex;align-items:center">
            <span class="online-dot" :class="rt.connected ? 'online' : 'offline'" />
            {{ rt.connected ? '已连接' : '离线' }}
          </span>
          <el-button text type="primary" @click="logout">登出</el-button>
        </div>
      </el-aside>

      <el-container>
        <!-- 顶栏：跟随主题 -->
        <el-header
          :style="{
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-1)',
            transition: 'background-color 0.25s ease, border-color 0.25s ease',
          }"
        >
          <h2 style="margin:0;font-size:18px;color:var(--text-1)">{{ $route.meta.title || 'AgriSense' }}</h2>
          <div style="margin-left:auto;display:flex;align-items:center;gap:12px">
            <!-- 主题切换按钮 -->
            <el-tooltip :content="isDark ? '切换到浅色' : '切换到深色'" placement="bottom">
              <el-button
                circle
                size="default"
                @click="theme.toggle()"
                :style="{
 background: 'var(--bg-elevated)',
 color: 'var(--text-1)',
 border: '1px solid var(--border)',
}"
              >
                <el-icon><component :is="isDark ? 'Sunny' : 'Moon'" /></el-icon>
              </el-button>
            </el-tooltip>

            <span style="color:var(--text-3);font-size:13px">{{ auth.user?.nickname }}</span>
            <el-avatar :size="32" style="background:var(--primary)">
              {{ auth.user?.nickname?.[0] || 'U' }}
            </el-avatar>
          </div>
        </el-header>
        <el-main :style="{ background: 'var(--bg-page)', transition: 'background-color 0.25s ease' }">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<style scoped>
.el-aside { position: relative; }
</style>