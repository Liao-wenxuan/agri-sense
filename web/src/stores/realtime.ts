import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io, type Socket } from 'socket.io-client'

interface SensorDataEvent {
  id: number
  sensor_id: number
  metric: string
  unit?: string
  value: number
  ts: string
}
interface AlertEvent {
  id: number
  rule_id: number | null
  sensor_id: number
  metric: string
  value: number
  threshold: number
  severity: string
  message: string
  created_at: string
}
interface AnomalyScoreEvent {
  sensor_id: number
  method?: 'zscore' | 'iforest'
  value: number
  zScore?: number
  score?: number
  isAnomaly: boolean
  severity: string
  pathLength?: number
  ts: string
}

export const useRealtimeStore = defineStore('realtime', () => {
  const socket = ref<Socket | null>(null)
  const connected = ref(false)
  const latestData = ref<SensorDataEvent[]>([])
  const recentAlerts = ref<AlertEvent[]>([])
  const anomalyScores = ref<Record<number, AnomalyScoreEvent>>({})
  const iforestScores = ref<Record<number, AnomalyScoreEvent>>({})
  const recentAnomalies = ref<any[]>([])
  const recentIForestAnomalies = ref<any[]>([])

  function connect() {
    if (socket.value) return
    socket.value = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
    })
    socket.value.on('connect', () => {
      connected.value = true
      console.log('🔌 Socket.io connected')
      socket.value?.emit('subscribe', ['sensor_data', 'alert', 'device_status', 'anomaly_score', 'anomaly', 'iforest_anomaly'])
    })
    socket.value.on('disconnect', () => { connected.value = false })
    socket.value.on('sensor_data', (data: SensorDataEvent) => {
      latestData.value.unshift(data)
      if (latestData.value.length > 200) latestData.value.pop()
    })
    socket.value.on('alert', (a: AlertEvent) => {
      recentAlerts.value.unshift(a)
      if (recentAlerts.value.length > 50) recentAlerts.value.pop()
    })
    socket.value.on('anomaly_score', (s: AnomalyScoreEvent) => {
      if (s.method === 'iforest') {
        iforestScores.value[s.sensor_id] = s
      } else {
        anomalyScores.value[s.sensor_id] = s
      }
    })
    socket.value.on('anomaly', (a: any) => {
      recentAnomalies.value.unshift(a)
      if (recentAnomalies.value.length > 50) recentAnomalies.value.pop()
    })
    socket.value.on('iforest_anomaly', (a: any) => {
      recentIForestAnomalies.value.unshift(a)
      if (recentIForestAnomalies.value.length > 50) recentIForestAnomalies.value.pop()
    })
  }

  function disconnect() {
    socket.value?.disconnect()
    socket.value = null
    connected.value = false
  }

  return { socket, connected, latestData, recentAlerts, anomalyScores, iforestScores, recentAnomalies, recentIForestAnomalies, connect, disconnect }
})