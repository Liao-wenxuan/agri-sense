import request from './request'

export interface Alert {
  id: number
  rule_id: number | null
  sensor_id: number
  metric: string
  value: number
  threshold: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'ack' | 'resolved' | 'ignored'
  message: string
  created_at: string
}

export function listAlerts(params?: { status?: string; severity?: string; limit?: number }) {
  return request.get<Alert[]>('/alerts', { params })
}

export function handleAlert(id: number, action: 'ack' | 'resolve' | 'ignore') {
  return request.post(`/alerts/${id}/handle`, { action })
}

export function listAlertRules() {
  return request.get('/alerts/rules')
}

export function createAlertRule(payload: any) {
  return request.post('/alerts/rules', payload)
}

export function deleteAlertRule(id: number) {
  return request.delete(`/alerts/rules/${id}`)
}