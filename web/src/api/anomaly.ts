import request from './request'

export interface AnomalyRecord {
  id: number
  sensor_id: number
  metric: string
  value: number
  z_score: number
  window_mean: number
  window_std: number
  severity: 'low' | 'medium' | 'high'
  method: 'zscore' | 'iforest'
  ts: string
}

export interface DetectorState {
  sensor_id: number
  metric: string
  window_size: number
  window_data: number[]
  cfg: { windowSize: number; zThreshold: number; minWindow: number }
  recent_anomalies: AnomalyRecord[]
}

export function getRecentAnomalies(params?: { metric?: string; severity?: string; method?: string; limit?: number }) {
  return request.get<AnomalyRecord[]>('/anomaly/recent', { params })
}

export function getDetectorState(sensorId: number) {
  return request.get<DetectorState>(`/anomaly/sensor/${sensorId}`)
}

export function getAllDetectors() {
  return request.get<any[]>('/anomaly/detectors')
}

export function getAllIForest() {
  return request.get<any[]>('/anomaly/iforest')
}

export function resetDetector(sensorId: number) {
  return request.post(`/anomaly/reset/${sensorId}`)
}

export function getAnomalyStats() {
  return request.get('/anomaly/stats')
}

export function compareAnomalyMethods(params: { sensor_id: number; from?: string; to?: string }) {
  return request.get('/anomaly/compare', { params })
}