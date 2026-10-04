import { Router } from 'express'
import db from '../lib/db'
import { requireAuth } from '../middleware/auth'
import { io } from '../index'

const router = Router()

// ===== 告警列表 =====
router.get('/', requireAuth, (req: any, res) => {
  const { status, severity, limit = '100' } = req.query
  let sql = 'SELECT * FROM alerts WHERE 1=1'
  const params: any[] = []
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (severity) { sql += ' AND severity = ?'; params.push(severity) }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(parseInt(limit as string, 10))
  res.json(db.prepare(sql).all(...params))
})

// ===== 处理告警 =====
router.post('/:id/handle', requireAuth, (req: any, res) => {
  const { action } = req.body  // ack / resolve / ignore
  const validActions = ['ack', 'resolve', 'ignore']
  if (!validActions.includes(action)) {
    return res.status(400).json({ message: 'action 必须是 ack/resolve/ignore' })
  }
  const newStatus = action === 'ack' ? 'ack' : action === 'resolve' ? 'resolved' : 'ignored'
  db.prepare(`
    UPDATE alerts SET status = ?, handled_by = ?, handled_at = datetime('now')
    WHERE id = ?
  `).run(newStatus, req.userId, req.params.id)

  io.emit('alert_update', { id: parseInt(req.params.id), status: newStatus })
  res.json({ success: true })
})

// ===== 告警规则 CRUD =====
router.get('/rules', requireAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM alert_rules ORDER BY id').all())
})

router.post('/rules', requireAuth, (req, res) => {
  const { sensor_id, metric, op, threshold, severity, channels } = req.body
  if (!sensor_id || !metric || !op || threshold === undefined) {
    return res.status(400).json({ message: 'sensor_id/metric/op/threshold 必填' })
  }
  const r = db.prepare(`
    INSERT INTO alert_rules (sensor_id, metric, op, threshold, severity, channels, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(sensor_id, metric, op, threshold, severity || 'medium', JSON.stringify(channels || ['websocket']))
  res.status(201).json({ id: r.lastInsertRowid })
})

router.delete('/rules/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM alert_rules WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ===== SMTP 测试（admin 才能用）=====
// POST /api/alerts/test-email
// 配置完 Render SMTP env 后调用一次，看自己邮箱是否收到测试邮件
router.post('/test-email', requireAuth, async (req: any, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ sent: false, reason: '需要 admin 权限' })
  }
  const { sendAlertEmail, isSmtpConfigured } = await import('../services/mailer')
  if (!isSmtpConfigured()) {
    return res.json({
      sent: false,
      reason: 'smtp_not_configured',
      hint: '需在 Render 配置 SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM 5 个 env var',
    })
  }
  const result: any = await sendAlertEmail({
    metric: 'system.test',
    value: 0,
    severity: 'low',
    source: 'manual_test',
    message: '这是一封 AgriSense SMTP 测试邮件。如果你看到这封邮件,说明 SMTP 配置成功!',
    created_at: new Date().toISOString(),
  })
  res.json(result)
})

export default router