<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/stores/theme'

// 启动时同步一次主题，避免闪烁
const theme = useThemeStore()
onMounted(() => {
  document.documentElement.setAttribute('data-theme', theme.mode)
})
</script>

<template>
  <RouterView />
</template>