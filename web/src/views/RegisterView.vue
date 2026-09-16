<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const form = ref({ email: '', password: '', nickname: '' })
const loading = ref(false)

async function handleRegister() {
  if (!form.value.email || !form.value.password || !form.value.nickname) {
    return ElMessage.warning('请填写完整')
  }
  if (form.value.password.length < 6) {
    return ElMessage.warning('密码至少 6 位')
  }
  loading.value = true
  try {
    await auth.registerApi(form.value.email, form.value.password, form.value.nickname)
    ElMessage.success('注册成功')
    router.push('/dashboard')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-card">
    <h2>🌱 注册新账号</h2>
    <el-form @submit.prevent="handleRegister" label-position="top">
      <el-form-item label="昵称">
        <el-input v-model="form.nickname" placeholder="农场主 / 管理员" />
      </el-form-item>
      <el-form-item label="邮箱">
        <el-input v-model="form.email" placeholder="farmer@example.com" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" placeholder="至少 6 位" show-password />
      </el-form-item>
      <el-button type="primary" :loading="loading" @click="handleRegister" style="width:100%">注册</el-button>
      <div style="text-align:center;margin-top:14px;font-size:13px;color:#64748b">
        已有账号？<router-link to="/login" style="color:var(--primary)">去登录</router-link>
      </div>
    </el-form>
  </div>
</template>