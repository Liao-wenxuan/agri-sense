import request from './request'

export interface UserInfo {
  id: number
  email: string
  nickname: string
  role: string
  avatar: string | null
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  nickname: string
}

export interface AuthResponse {
  accessToken: string
  userInfo: UserInfo
}

export function login(data: LoginPayload) {
  return request.post<AuthResponse, AuthResponse>('/auth/login', data)
}

export function register(data: RegisterPayload) {
  return request.post<AuthResponse, AuthResponse>('/auth/register', data)
}

export function getMe() {
  return request.get<UserInfo>('/auth/me')
}