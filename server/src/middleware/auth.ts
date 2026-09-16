import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../lib/config'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未登录：请先登录' })
  }
  const token = authHeader.slice(7)
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: number; email: string }
    req.userId = decoded.userId
    next()
  } catch {
    return res.status(401).json({ message: 'token 无效或已过期，请重新登录' })
  }
}