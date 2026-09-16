import request from './request'

export interface SensorDataPoint {
  id: number
  sensor_id: number
  value: number
  ts: string
  quality_flag: number
}

export function querySensorData(params: {
  sensor_id: number
  from?: string
  to?: string
  limit?: number
}) {
  return request.get<SensorDataPoint[]>('/sensor-data', { params })
}

export function exportSensorCsv(params: { sensor_id: number; from?: string; to?: string }) {
  return request.get('/sensor-data/export.csv', { params, responseType: 'blob' })
}