import request from './request'

export interface Device {
  id: number
  greenhouse_id: number
  greenhouse_name?: string
  name: string
  type: 'sensor' | 'controller'
  status: 'online' | 'offline' | 'fault'
  last_heartbeat: string | null
  capabilities: string  // JSON string
  sensors: Sensor[]
}

export interface Sensor {
  id: number
  device_id: number
  metric: 'temperature' | 'humidity' | 'soil_moisture' | 'light' | 'co2'
  unit: string
  range_min: number | null
  range_max: number | null
}

export function listDevices(params?: { greenhouse_id?: number; status?: string }) {
  return request.get<Device[]>('/devices', { params })
}

export function getDevice(id: number) {
  return request.get<Device>(`/devices/${id}`)
}

export function createDevice(payload: any) {
  return request.post('/devices', payload)
}

export function controlDevice(id: number, payload: { action: string; target?: string; params?: any }) {
  return request.post(`/devices/${id}/control`, payload)
}

export function getDeviceLogs(id: number) {
  return request.get(`/devices/${id}/logs`)
}

export function getStats() {
  return request.get('/stats/dashboard')
}

export function getLatest() {
  return request.get('/stats/latest')
}