import { Router } from 'express'
import db from '../lib/db'
import { io } from '../index'
import { runRulesForSensor } from '../services/alertEngine'
import { detect, recordAnomaly } from '../services/anomaly'
import { detectIForest, recordIForestAnomaly } from '../services/isolationForest'

const router = Router()

// ===== 设备上报（模拟器调用，无需鉴权） =====
router.post('/', (req, res) => {
  const { sensor_id, value, ts } = req.body
  if (!sensor_id || value === undefined) {
    return res.status(400).json({ message: 'sensor_id 与 value 必填' })
  }
  const tsFinal = ts || new Date().toISOString()

  const r = db.prepare(`
    INSERT INTO sensor_data (sensor_id, value, ts) VALUES (?, ?, ?)
  `).run(sensor_id, value, tsFinal)
  const id = r.lastInsertRowid as number

  // 实时推送给前端（带 metric 让前端按指标分组画图）
  const sensor = db.prepare('SELECT metric, unit FROM sensors WHERE id = ?').get(sensor_id) as { metric: string; unit: string } | undefined
  io.emit('sensor_data', { id, sensor_id, metric: sensor?.metric || '', unit: sensor?.unit || '', value, ts: tsFinal })

  // 触发规则告警检测（异步）
  setImmediate(() => runRulesForSensor(sensor_id, value, tsFinal))

  // 触发 Z-Score 算法异常检测（异步）
  setImmediate(() => {
    const sensor = db.prepare('SELECT metric FROM sensors WHERE id = ?').get(sensor_id) as any
    if (!sensor) return
    const metric = sensor.metric

    // Z-Score 检测
    const zResult = detect(sensor_id, value)
    if (zResult?.isAnomaly) {
      recordAnomaly(sensor_id, metric, value, zResult, tsFinal)
    }
    io.emit('anomaly_score', { sensor_id, method: 'zscore', ...zResult, value, ts: tsFinal })

    // IForest 检测
    const ifResult = detectIForest(sensor_id, value)
    if (ifResult?.isAnomaly) {
      recordIForestAnomaly(sensor_id, metric, value, ifResult, tsFinal)
    }
    io.emit('anomaly_score', { sensor_id, method: 'iforest', ...ifResult, value, ts: tsFinal })
  })

  res.status(201).json({ id })
})

// ===== 历史查询 =====
router.get('/', (req, res) => {
  const { sensor_id, from, to, limit = '500' } = req.query
  if (!sensor_id) return res.status(400).json({ message: 'sensor_id 必填' })
  let sql = 'SELECT * FROM sensor_data WHERE sensor_id = ?'
  const params: any[] = [sensor_id]
  if (from) { sql += ' AND ts >= ?'; params.push(from) }
  if (to) { sql += ' AND ts <= ?'; params.push(to) }
  sql += ' ORDER BY ts DESC LIMIT ?'
  params.push(parseInt(limit as string, 10))
  const rows = db.prepare(sql).all(...params)
  res.json(rows.reverse()) // 前端期望时间正序
})

// ===== CSV 导出 =====
router.get('/export.csv', (req, res) => {
  const { sensor_id, from, to } = req.query
  if (!sensor_id) return res.status(400).send('sensor_id required')
  let sql = `
    SELECT sd.ts, s.metric, s.unit, sd.value, sd.quality_flag
    FROM sensor_data sd
    JOIN sensors s ON sd.sensor_id = s.id
    WHERE sd.sensor_id = ?
  `
  const params: any[] = [sensor_id]
  if (from) { sql += ' AND sd.ts >= ?'; params.push(from) }
  if (to) { sql += ' AND sd.ts <= ?'; params.push(to) }
  sql += ' ORDER BY sd.ts'
  const rows = db.prepare(sql).all(...params) as any[]

  const csv = ['ts,metric,unit,value,quality_flag']
  rows.forEach(r => csv.push(`${r.ts},${r.metric},${r.unit},${r.value},${r.quality_flag}`))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="sensor_${sensor_id}_${Date.now()}.csv"`)
  res.send('\ufeff' + csv.join('\n'))  // BOM 防 Excel 乱码
})

// ===== 大屏汇总统计 =====
router.get('/stats/summary', (req, res) => {
  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT sensor_id) AS sensor_count,
      COUNT(*) AS data_points,
      MAX(ts) AS last_update
    FROM sensor_data
    WHERE ts >= datetime('now', '-1 hour')
  `).get()
  res.json(row)
})

export default router