import { Router } from 'express'
import db from '../lib/db'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// ===== 大屏汇总 =====
router.get('/dashboard', (_req, res) => {
  const devices = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online,
      SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offline,
      SUM(CASE WHEN status = 'fault' THEN 1 ELSE 0 END) AS fault
    FROM devices
  `).get()

  const alerts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN severity = 'critical' AND status = 'pending' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN created_at >= datetime('now', '-24h') THEN 1 ELSE 0 END) AS today_total
    FROM alerts
  `).get()

  const dataPoints = db.prepare(`
    SELECT COUNT(*) AS total FROM sensor_data WHERE ts >= datetime('now', '-1 hour')
  `).get()

  res.json({
    devices,
    alerts,
    dataPoints,
    timestamp: new Date().toISOString(),
  })
})

// ===== 最新数据（每指标最新一条） =====
router.get('/latest', (_req, res) => {
  const rows = db.prepare(`
    SELECT sd.sensor_id, sd.value, sd.ts, s.metric, s.unit, s.device_id
    FROM sensor_data sd
    JOIN sensors s ON sd.sensor_id = s.id
    WHERE sd.id IN (
      SELECT MAX(id) FROM sensor_data GROUP BY sensor_id
    )
    ORDER BY s.metric, s.device_id
  `).all()
  res.json(rows)
})

export default router