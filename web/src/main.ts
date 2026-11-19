import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// Element Plus 官方暗色变量（选择器 html.dark）。
// 必须在 main.css 之前引入，让项目自有 token 覆盖 EP 默认值。
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import App from './App.vue'
import router from './router'
import { useThemeStore } from './stores/theme'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 挂载前应用持久化的主题（此时 pinia 已完成 hydrate），避免首屏浅色闪烁
useThemeStore(pinia).applyNow()

// 注册全部 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component as any)
}

app.mount('#app')