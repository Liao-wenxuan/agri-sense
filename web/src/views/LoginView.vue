<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const form = ref({ email: '', password: '' })
const loading = ref(false)

async function handleLogin() {
  if (!form.value.email || !form.value.password) {
    return ElMessage.warning('请填写邮箱和密码')
  }
  loading.value = true
  try {
    await auth.loginApi(form.value.email, form.value.password)
    ElMessage.success('登录成功')
    router.push((router.currentRoute.value.query.redirect as string) || '/dashboard')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '登录失败')
  } finally {
    loading.value = false
  }
}

// 演示模式自动登录：URL 加 ?demo=auto 自动用 demo 凭证登录跳转
onMounted(() => {
  if (route.query.demo === 'auto') {
    form.value.email = 'demo@agri.local'
    form.value.password = 'admin123'
    handleLogin()
  }
})
</script>

<template>
  <div class="auth-card">
    <h2>🌱 AgriSense 登录</h2>
    <el-form @submit.prevent="handleLogin" label-position="top">
      <el-form-item label="邮箱">
        <el-input v-model="form.email" placeholder="farmer@example.com" clearable />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" placeholder="至少 6 位" show-password @keyup.enter="handleLogin" />
      </el-form-item>
      <el-button type="primary" :loading="loading" @click="handleLogin" style="width:100%">登录</el-button>
      <div style="text-align:center;margin-top:14px;font-size:13px;color:#64748b">
        还没账号？<router-link to="/register" style="color:var(--primary)">立即注册</router-link>
      </div>
    </el-form>
  </div>
</template>