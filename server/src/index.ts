import express from 'express'
import cors from 'cors'
import http from 'http'
import path from 'path'
import { Server as IOServer } from 'socket.io'
import './lib/db'  // 触发建表

import authRouter from './routes/auth'
import farmsRouter from './routes/farms'
import devicesRouter from './routes/devices'
import sensorDataRouter from './routes/sensor-data'
import alertsRouter from './routes/alerts'
import statsRouter from './routes/stats'
import anomalyRouter from './routes/anomaly'
import { config } from './lib/config'
import { preloadDetectors } from './services/anomaly'
import { ensureSeed } from './seed'

const app = express()
const server = http.createServer(app)
export const io = new IOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

// ===== 中间件 =====
app.use(cors())
app.use(express.json())

// ===== 路由 =====
app.use('/api/auth', authRouter)
app.use('/api/farms', farmsRouter)
app.use('/api/devices', devicesRouter)
app.use('/api/sensor-data', sensorDataRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/anomaly', anomalyRouter)
app.use('/api/stats', statsRouter)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'agri-sense-server',
    timestamp: new Date().toISOString(),
  })
})

// ===== 静态前端（生产模式：与 web/dist 合并到容器）=====
import fs from 'fs'
const _publicCandidates = [
  process.env.PUBLIC_DIR,
  path.join(__dirname, 'public'),
  path.join(__dirname, '../public'),
  path.join(process.cwd(), 'public'),
  path.join(process.cwd(), 'server/dist/public'),
  path.join(process.cwd(), 'server/public'),
].filter(Boolean) as string[]
const publicDir =
  _publicCandidates.find((p) => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  }) || _publicCandidates[1]
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir))
  // SPA fallback：所有非 /api 请求都返回 index.html
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'))
  })
  console.log(`📂 Serving static from: ${publicDir}`)
}

// ===== Socket.io 连接管理 =====
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`)
  socket.on('subscribe', (topics: string[]) => {
    topics.forEach(t => socket.join(t))
    console.log(`  → subscribed: ${topics.join(', ')}`)
  })
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`)
  })
})

// ===== Simulator（可选：同进程跑）=====
if (process.env.SIMULATOR === 'true') {
  import('./services/simulatorRunner').then(m => {
    m.startSimulator()
    console.log('🤖 Simulator 已在同进程启动（5s 推送周期）')
  })
}

// ===== 启动 =====
ensureSeed()  // 首次部署时自动种子用户/农场/大棚/传感器/告警规则
preloadDetectors()  // 从 DB 回填每个传感器的滑动窗口（启动一次）
server.listen(config.PORT, () => {
  console.log(`\n🌱 AgriSense Server`)
  console.log(`   HTTP:  http://localhost:${config.PORT}`)
  console.log(`   Socket: ws://localhost:${config.PORT}`)
  console.log(`   Health: http://localhost:${config.PORT}/api/health\n`)
})