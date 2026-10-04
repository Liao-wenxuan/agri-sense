import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import db from '../lib/db'
import { config } from '../lib/config'

// 扩展 Express Request 类型，让中间件挂的属性可被路由访问
declare module 'express-serve-static-core' {
  interface Request {
    userId?: number
    userRole?: string
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未登录：请先登录' })
  }
  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: number; email: string }
    req.userId = decoded.userId
    // 同步查库补 role（admin 路由需要 req.userRole 判定）
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(decoded.userId) as { role: string } | undefined
    req.userRole = row?.role
    next()
  } catch {
    return res.status(401).json({ message: 'token 无效或已过期，请重新登录' })
  }
}