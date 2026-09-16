import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/api/auth'

interface UserInfo {
  id: number
  email: string
  nickname: string
  role: string
  avatar: string | null
}

export const useAuthStore = defineStore(
  'auth',
  () => {
    const user = ref<UserInfo | null>(null)
    const token = ref<string | null>(null)

    const isLoggedIn = computed(() => !!token.value)

    async function loginApi(email: string, password: string) {
      const res = await authApi.login({ email, password })
      token.value = res.accessToken
      user.value = res.userInfo
    }

    async function registerApi(email: string, password: string, nickname: string) {
      const res = await authApi.register({ email, password, nickname })
      token.value = res.accessToken
      user.value = res.userInfo
    }

    function logout() {
      user.value = null
      token.value = null
    }

    return { user, token, isLoggedIn, loginApi, registerApi, logout }
  },
  {
    persist: {
      pick: ['token', 'user'],
    },
  }
)