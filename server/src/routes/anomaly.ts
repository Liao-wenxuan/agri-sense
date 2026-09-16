/**
 * 异常检测 REST 接口
 * - GET  /api/anomaly/recent                 最近异常记录
 * - GET  /api/anomaly/sensor/:id             单传感器算法状态
 * - GET  /api/anomaly/detectors              所有检测器（Z-Score）
 * - GET  /api/anomaly/iforest                所有 IForest 状态
 * - POST /api/anomaly/reset/:id              重置某传感器（重训 IForest + 回填 Z-Score）
 * - GET  /api/anomaly/stats                  异常统计（按 metric + method 分组）
 * - GET  /api/anomaly/compare?sensor_id=&from=&to=  Z-Score vs IForest 对比结果
 */
import { Router } from 'express'
import db from '../lib/db'
import { requireAuth } from '../middleware/auth'
import { getDetectorState, listDetectors, preloadDetectors } from '../services/anomaly'
import { listIForest, retrainIForest } from '../services/isolationForest'

const router = Router()
router.use(requireAuth)

// ===== 最近异常记录 =====
router.get('/recent', (req, res) => {
  const { metric, severity, sensor_id, method, limit = '100' } = req.query
  let sql = `
    SELECT a.*, s.metric, s.unit, d.name AS device_name
    FROM anomaly_records a
    JOIN sensors s ON a.sensor_id = s.id
    JOIN devices d ON s.device_id = d.id
    WHERE 1=1
  `
  const params: any[] = []
  if (metric) { sql += ' AND a.metric = ?'; params.push(metric) }
  if (severity) { sql += ' AND a.severity = ?'; params.push(severity) }
  if (sensor_id) { sql += ' AND a.sensor_id = ?'; params.push(sensor_id) }
  if (method) { sql += ' AND a.method = ?'; params.push(method) }
  sql += ' ORDER BY a.ts DESC LIMIT ?'
  params.push(parseInt(limit as string, 10))
  res.json(db.prepare(sql).all(...params))
})

// ===== 单传感器算法状态（含窗口统计）=====
router.get('/sensor/:id', (req, res) => {
  const sensorId = parseInt(req.params.id, 10)
  const state = getDetectorState(sensorId)
  if (!state) return res.status(404).json({ message: '传感器不存在或未初始化' })

  const recentAnomalies = db.prepare(`
    SELECT * FROM anomaly_records
    WHERE sensor_id = ? ORDER BY ts DESC LIMIT 20
  `).all(sensorId)

  res.json({
    sensor_id: sensorId,
    metric: state.metric,
    window_size: state.size,
    window_data: state.window,
    cfg: state.cfg,
    recent_anomalies: recentAnomalies,
  })
})

// ===== Z-Score 检测器列表 =====
router.get('/detectors', (_req, res) => {
  res.json(listDetectors())
})

// ===== IForest 列表 =====
router.get('/iforest', (_req, res) => {
  res.json(listIForest())
})

// ===== 重置某传感器窗口 =====
router.post('/reset/:id', (req, res) => {
  const sensorId = parseInt(req.params.id, 10)
  preloadDetectors()
  retrainIForest(sensorId)
  res.json({ success: true, message: `已重置 sensor ${sensorId}（Z-Score + IForest）` })
})

// ===== 异常统计 =====
router.get('/stats', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      method,
      metric,
      COUNT(*) AS total,
      SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high_count,
      SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) AS medium_count,
      MAX(ts) AS last_anomaly_at
    FROM anomaly_records
    WHERE ts >= datetime('now', '-7 days')
    GROUP BY method, metric
    ORDER BY method, metric
  `).all()
  res.json(rows)
})

// ===== Z-Score vs IForest 对比（同一时间窗口）=====
router.get('/compare', (req, res) => {
  const { sensor_id, from, to } = req.query
  if (!sensor_id) return res.status(400).json({ message: 'sensor_id 必填' })

  const params: any[] = [sensor_id]
  let timeFilter = ''
  if (from) { timeFilter += ' AND ts >= ?'; params.push(from) }
  if (to)   { timeFilter += ' AND ts <= ?'; params.push(to) }

  const zscore = db.prepare(`
    SELECT COUNT(*) AS n FROM anomaly_records
    WHERE sensor_id = ? AND method = 'zscore' ${timeFilter}
  `).get(...params) as any

  const iforest = db.prepare(`
    SELECT COUNT(*) AS n FROM anomaly_records
    WHERE sensor_id = ? AND method = 'iforest' ${timeFilter}
  `).get(...params) as any

  res.json({
    sensor_id: parseInt(sensor_id as string, 10),
    zscore_count: zscore.n,
    iforest_count: iforest.n,
    from, to,
  })
})

// ===== 回填历史窗口（演示用）=====
router.post('/backfill', (_req, res) => {
  preloadDetectors()
  res.json({ success: true, message: '已重新加载历史窗口' })
})

export default router