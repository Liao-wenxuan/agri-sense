/**
 * 内部 seed：通过 better-sqlite3 直接向 DB 写入测试数据。
 * 当 users 表为空时自动调用（首次部署 fresh DB 场景），保证评委/演示拿到完整数据。
 */
import bcrypt from 'bcryptjs'
import db from './lib/db'

type GHConfig = { name: string; crop: string; area: number }
type SensorConfig = { metric: string; unit: string; range: [number, number] }
type RuleConfig = { metric: string; threshold: number; op: string; severity: string }

const METRICS: SensorConfig[] = [
  { metric: 'temperature', unit: '℃', range: [-10, 50] },
  { metric: 'humidity', unit: '%', range: [0, 100] },
  { metric: 'soil_moisture', unit: '%', range: [0, 100] },
  { metric: 'light', unit: 'lux', range: [0, 100000] },
  { metric: 'co2', unit: 'ppm', range: [0, 5000] },
]

// 各指标默认告警阈值（演示用）
const RULES: Record<string, RuleConfig[]> = {
  temperature: [
    { metric: 'temperature', op: '>', threshold: 32, severity: 'high' },
    { metric: 'temperature', op: '<', threshold: 10, severity: 'medium' },
  ],
  humidity: [
    { metric: 'humidity', op: '<', threshold: 30, severity: 'medium' },
  ],
  soil_moisture: [
    { metric: 'soil_moisture', op: '<', threshold: 25, severity: 'high' },
  ],
  co2: [
    { metric: 'co2', op: '>', threshold: 1500, severity: 'medium' },
  ],
}

const GHS: GHConfig[] = [
  { name: 'A1-番茄棚', crop: 'tomato', area: 240 },
  { name: 'A2-黄瓜棚', crop: 'cucumber', area: 200 },
  { name: 'A3-草莓棚', crop: 'strawberry', area: 180 },
]

export function isEmpty(): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
  return row.c === 0
}

export function ensureSeed(): void {
  if (!isEmpty()) {
    console.log('🌱 DB 已有用户数据，跳过 seed')
    return
  }
  console.log('🌱 检测到空 DB，开始 internal seed...')

  // 1. 用户（admin + demo）
  const hashed = bcrypt.hashSync('admin123', 10)
  const userId = db
    .prepare(
      `INSERT INTO users (email, password, nickname, role) VALUES (?, ?, ?, 'admin')`
    )
    .run('admin@agri.local', hashed, '农场管理员').lastInsertRowid as number
  db.prepare(
    `INSERT INTO users (email, password, nickname, role) VALUES (?, ?, ?, 'viewer')`
  ).run('demo@agri.local', hashed, '演示账号')

  // 2. 农场
  const farmId = db
    .prepare(`INSERT INTO farms (name, address, owner_id) VALUES (?, ?, ?)`)
    .run('川农智慧农场', '四川·雅安', userId).lastInsertRowid as number

  // 3. 大棚 + 传感器
  for (const gh of GHS) {
    const ghId = db
      .prepare(
        `INSERT INTO greenhouses (farm_id, name, crop_type, area) VALUES (?, ?, ?, ?)`
      )
      .run(farmId, gh.name, gh.crop, gh.area).lastInsertRowid as number

    // 每个大棚装一个环境数据采集器（type=sensor）
    const deviceId = db
      .prepare(
        `INSERT INTO devices (greenhouse_id, name, type, status, last_heartbeat, capabilities) VALUES (?, ?, 'sensor', 'online', datetime('now'), ?)`
      )
      .run(ghId, `${gh.name}-采集器`, JSON.stringify(['read_sensors'])).lastInsertRowid as number

    // 5 个传感器
    for (const s of METRICS) {
      const sensorId = db
        .prepare(
          `INSERT INTO sensors (device_id, metric, unit, range_min, range_max) VALUES (?, ?, ?, ?, ?)`
        )
        .run(deviceId, s.metric, s.unit, s.range[0], s.range[1]).lastInsertRowid as number

      // 默认告警规则
      for (const r of RULES[s.metric] || []) {
        db.prepare(
          `INSERT INTO alert_rules (sensor_id, metric, op, threshold, severity, channels) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(sensorId, r.metric, r.op, r.threshold, r.severity, JSON.stringify(['websocket']))
      }
    }
  }

  console.log(`✅ Seed 完成: 1 农场 / ${GHS.length} 大棚 / ${GHS.length} 采集器 / ${GHS.length * METRICS.length} 传感器`)
}

// 如果被直接运行（`tsx src/seed.ts`）则执行
if (require.main === module) {
  ensureSeed()
}
