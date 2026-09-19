import { Router } from 'express'
import db from '../lib/db'
import { requireAuth } from '../middleware/auth'
import { io } from '../index'

const router = Router()
router.use(requireAuth)

// ===== 设备列表（含传感器） =====
// 演示场景：所有登录用户共享查看
router.get('/', (req: any, res) => {
  const { greenhouse_id, status } = req.query
  let sql = `
    SELECT d.*, g.name AS greenhouse_name, g.farm_id
    FROM devices d
    JOIN greenhouses g ON d.greenhouse_id = g.id
  `
  const params: any[] = []
  const conditions: string[] = []
  if (greenhouse_id) { conditions.push('d.greenhouse_id = ?'); params.push(greenhouse_id) }
  if (status) { conditions.push('d.status = ?'); params.push(status) }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY d.id'
  const devices = db.prepare(sql).all(...params) as any[]

  // 附带传感器
  const sensorStmt = db.prepare('SELECT * FROM sensors WHERE device_id = ?')
  devices.forEach(d => {
    d.sensors = sensorStmt.all(d.id)
  })
  res.json(devices)
})

// ===== 新增设备 =====
router.post('/', (req, res) => {
  const { greenhouse_id, name, type, capabilities, sensors } = req.body
  if (!greenhouse_id || !name || !type) {
    return res.status(400).json({ message: 'greenhouse_id/name/type 必填' })
  }
  const r = db.prepare(`
    INSERT INTO devices (greenhouse_id, name, type, capabilities, status, last_heartbeat)
    VALUES (?, ?, ?, ?, 'online', datetime('now'))
  `).run(greenhouse_id, name, type, JSON.stringify(capabilities || []))
  const deviceId = r.lastInsertRowid as number

  if (Array.isArray(sensors)) {
    const ins = db.prepare(`
      INSERT INTO sensors (device_id, metric, unit, range_min, range_max) VALUES (?, ?, ?, ?, ?)
    `)
    for (const s of sensors) {
      ins.run(deviceId, s.metric, s.unit, s.range_min ?? null, s.range_max ?? null)
    }
  }
  res.status(201).json({ id: deviceId })
})

// ===== 设备详情 =====
router.get('/:id', (req, res) => {
  const device = db.prepare(`
    SELECT d.*, g.name AS greenhouse_name FROM devices d
    JOIN greenhouses g ON d.greenhouse_id = g.id WHERE d.id = ?
  `).get(req.params.id)
  if (!device) return res.status(404).json({ message: '设备不存在' })
  const sensors = db.prepare('SELECT * FROM sensors WHERE device_id = ?').all(req.params.id)
  res.json({ ...device, sensors })
})

// ===== 远程控制 =====
router.post('/:id/control', (req: any, res) => {
  const { action, target, params } = req.body
  if (!action) return res.status(400).json({ message: 'action 必填' })

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as any
  if (!device) return res.status(404).json({ message: '设备不存在' })

  // 写日志
  db.prepare(`
    INSERT INTO control_logs (device_id, action, params, result) VALUES (?, ?, ?, ?)
  `).run(req.params.id, `${action}:${target || ''}`, JSON.stringify(params || {}), 'success')

  // 通过 Socket.io 通知模拟器执行
  io.to(`device:${req.params.id}`).emit('control', { action, target, params })

  // 广播状态变化
  io.emit('device_status', { device_id: device.id, status: 'online', action })

  res.json({ success: true, message: '控制指令已下发' })
})

// ===== 控制日志 =====
router.get('/:id/logs', (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM control_logs WHERE device_id = ? ORDER BY ts DESC LIMIT 100
  `).all(req.params.id)
  res.json(logs)
})

export default router