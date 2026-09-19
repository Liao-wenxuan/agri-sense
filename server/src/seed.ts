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

  // 给每个传感器灌 30 个历史数据点（过去 2.5 分钟，5s 间隔）
  // 这样 IForest 立即可用（要求 >10 点），算法对比页/历史图都有现成数据
  backfillSensorData(30)

  console.log(`✅ Seed 完成: 1 农场 / ${GHS.length} 大棚 / ${GHS.length} 采集器 / ${GHS.length * METRICS.length} 传感器（含历史数据回填）`)
}

function backfillSensorData(pointsPerSensor = 30) {
  const sensorRows = db.prepare(`SELECT s.id AS sid, s.metric, s.range_min, s.range_max FROM sensors s`).all() as Array<{
    sid: number
    metric: string
    range_min: number
    range_max: number
  }>
  const insert = db.prepare(`INSERT INTO sensor_data (sensor_id, value, ts, quality_flag) VALUES (?, ?, ?, 1)`)
  const intervalMs = 5000
  const baseTs = Date.now() - pointsPerSensor * intervalMs
  for (const s of sensorRows) {
    const [mn, mx] = [s.range_min ?? 0, s.range_max ?? 100]
    const baseVal = mn + (mx - mn) * 0.5
    for (let i = 0; i < pointsPerSensor; i++) {
      // 加入正常波动（±5%）+ 一个异常峰（最后一点 ±30%）让异常检测有东西可看
      let v = baseVal + (Math.random() - 0.5) * (mx - mn) * 0.05
      if (i === pointsPerSensor - 1 && (s.metric === 'temperature' || s.metric === 'co2')) {
        v = mx * 0.92 + Math.random() * (mx - mn) * 0.05
      }
      const ts = new Date(baseTs + i * intervalMs).toISOString().slice(0, 19).replace('T', ' ')
      insert.run(s.sid, Number(v.toFixed(2)), ts)
    }
  }
  console.log(`📊 已为 ${sensorRows.length} 个传感器回填 ${pointsPerSensor} 个历史数据点`)
}

// 如果被直接运行（`tsx src/seed.ts`）则执行
if (require.main === module) {
  ensureSeed()
}
