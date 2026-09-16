/**
 * 主题切换 Store
 * - 支持 light / dark 两种主题
 * - 持久化到 localStorage（pinia-plugin-persistedstate）
 * - 启动时应用到 <html data-theme="..."> 让全局 CSS 变量生效
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark'

export const useThemeStore = defineStore(
  'theme',
  () => {
    const mode = ref<ThemeMode>('light')

    function apply(m: ThemeMode) {
      document.documentElement.setAttribute('data-theme', m)
    }

    function toggle() {
      mode.value = mode.value === 'light' ? 'dark' : 'light'
    }

    function set(m: ThemeMode) {
      mode.value = m
    }

    // 启动时立刻应用（防止闪烁）
    apply(mode.value)

    // 模式变化时同步到 DOM
    watch(mode, (m) => apply(m), { immediate: false })

    return { mode, toggle, set }
  },
  {
    persist: {
      pick: ['mode'],
    },
  }
)