import { Router } from 'express'
import db from '../lib/db'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// ===== 农场 =====
// 挂载点 /api/farms，所以这里用根路径
// 演示场景：所有登录用户共享查看同一份 demo 数据（不再按 owner 过滤）
router.get('/', (_req, res) => {
  const farms = db.prepare('SELECT * FROM farms ORDER BY id DESC').all()
  res.json(farms)
})

router.post('/', (req, res) => {
  const { name, address } = req.body
  if (!name) return res.status(400).json({ message: '农场名必填' })
  const r = db.prepare('INSERT INTO farms (name, address, owner_id) VALUES (?, ?, ?)').run(name, address || '', req.userId)
  res.status(201).json({ id: r.lastInsertRowid })
})

// ===== 大棚 =====
// 挂载点 /api/farms/greenhouses
router.get('/greenhouses', (req: any, res) => {
  const { farm_id } = req.query
  const list = farm_id
    ? db.prepare('SELECT * FROM greenhouses WHERE farm_id = ? ORDER BY id').all(farm_id)
    : db.prepare(`SELECT g.* FROM greenhouses g JOIN farms f ON g.farm_id = f.id ORDER BY g.id`).all()
  res.json(list)
})

router.post('/greenhouses', (req, res) => {
  const { farm_id, name, crop_type, area } = req.body
  if (!farm_id || !name) return res.status(400).json({ message: 'farm_id 与 name 必填' })
  const r = db.prepare(`
    INSERT INTO greenhouses (farm_id, name, crop_type, area) VALUES (?, ?, ?, ?)
  `).run(farm_id, name, crop_type || '', area || 0)
  res.status(201).json({ id: r.lastInsertRowid })
})

export default router