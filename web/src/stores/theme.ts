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
      const root = document.documentElement
      root.setAttribute('data-theme', m)
      // Element Plus 2.8 的官方暗色变量挂在 `html.dark` 下，
      // 不加这个 class，组件（表格 hover 行 / 标签 / 弹层）会回落成浅色调色板
      root.classList.toggle('dark', m === 'dark')
    }

    /** 立即按当前 mode 应用一次（首屏挂载前调用，避免浅色闪烁） */
    function applyNow() {
      apply(mode.value)
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

    return { mode, toggle, set, applyNow }
  },
  {
    persist: {
      pick: ['mode'],
    },
  }
)