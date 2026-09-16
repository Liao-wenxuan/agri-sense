import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../lib/db'
import { config } from '../lib/config'

const router = Router()

// ===== POST /register =====
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, nickname } = req.body
    if (!email || !password || !nickname) {
      return res.status(400).json({ message: '请填写邮箱、密码、昵称' })
    }
    if (password.length < 6) {
      return res.status(400).json({ message: '密码至少 6 位' })
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      return res.status(409).json({ message: '该邮箱已注册' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const result = db.prepare(`
      INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)
    `).run(email, hashedPassword, nickname)

    const userId = result.lastInsertRowid as number
    const token = jwt.sign({ userId, email }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN })

    res.status(201).json({
      accessToken: token,
      userInfo: { id: userId, email, nickname, role: 'admin', avatar: null },
    })
  } catch (err: any) {
    console.error('[Register Error]', err)
    res.status(500).json({ message: err.message || '注册失败' })
  }
})

// ===== POST /login =====
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any
    if (!user) {
      return res.status(401).json({ message: '邮箱或密码错误' })
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ message: '邮箱或密码错误' })
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    )
    res.json({
      accessToken: token,
      userInfo: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        avatar: user.avatar,
      },
    })
  } catch (err: any) {
    console.error('[Login Error]', err)
    res.status(500).json({ message: err.message || '登录失败' })
  }
})

// ===== GET /me =====
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ message: '未登录' })
  try {
    const token = authHeader.slice(7)
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: number }
    const user = db.prepare('SELECT id, email, nickname, role, avatar FROM users WHERE id = ?').get(decoded.userId) as any
    if (!user) return res.status(404).json({ message: '用户不存在' })
    res.json(user)
  } catch {
    return res.status(401).json({ message: 'token 无效' })
  }
})

export default router