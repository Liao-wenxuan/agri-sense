/**
 * AgriSense 设备模拟器
 *
 * 模拟多个大棚的多类传感器，每 N 秒上报一次数据到后端
 * - 温度、湿度：昼夜正弦曲线 + 随机扰动
 * - 光照：日出日落弧线（0-1000 lux）
 * - 土壤湿度：缓慢下降 + 灌溉补充
 * - CO2：400-1500 ppm
 * - 主动注入偶发异常 + 设备掉线，触发告警演示
 */
const axios = require('axios')

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'
const REPORT_INTERVAL_MS = parseInt(process.env.INTERVAL || '5000', 10)  // 默认 5s

// ===== 配置：3 个大棚 × 4 类传感器 =====
const GREENHOUSES = [
  { id: 1, name: 'A1棚（番茄）',  crop: 'tomato',   tempBase: 24 },
  { id: 2, name: 'A2棚（黄瓜）',  crop: 'cucumber', tempBase: 26 },
  { id: 3, name: 'A3棚（草莓）',  crop: 'strawberry', tempBase: 18 },
]

// 模拟器内置缓存（动态状态：土壤湿度要随时间下降）
const states = {}

function getGreenhouseState(ghId) {
  if (!states[ghId]) {
    states[ghId] = {
      soil_moisture: 0.55 + Math.random() * 0.1,
      irrigation_count: 0,
      faultUntil: 0,
    }
  }
  return states[ghId]
}

// ===== 数学模型 =====
function diurnalSin(hour, peakHour = 14, minVal, maxVal) {
  const phase = ((hour - peakHour) / 24) * 2 * Math.PI
  const norm = (Math.cos(phase) + 1) / 2  // 0..1
  return minVal + norm * (maxVal - minVal)
}

function daylightCurve(hour) {
  // 6:00 日出，18:00 日落，峰 12:00
  if (hour < 6 || hour > 18) return 0
  const norm = (hour - 6) / 12
  return Math.sin(norm * Math.PI) * 1000
}

function noise(std = 0.5) {
  // Box-Muller 正态分布
  const u = Math.random(), v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std
}

// ===== 生成单个大棚的指标 =====
function generateGreenhouseData(gh, now = new Date()) {
  const hour = now.getHours() + now.getMinutes() / 60
  const state = getGreenhouseState(gh.id)
  const faultActive = Date.now() < state.faultUntil

  // 温度：22-35 ℃ 昼夜波动
  let temperature = diurnalSin(hour, 14, 22, 35) + noise(0.6)
  // 湿度：与温度负相关 50-85%
  let humidity = diurnalSin(hour, 4, 50, 85) - (temperature - 22) * 0.8 + noise(2)
  humidity = Math.max(20, Math.min(100, humidity))
  // 光照
  let light = daylightCurve(hour) + noise(20)
  light = Math.max(0, light)
  // CO2
  let co2 = 400 + Math.max(0, diurnalSin(hour, 9, 0, 800) - light * 0.3) + noise(30)
  // 土壤湿度：缓慢蒸发
  state.soil_moisture -= 0.001 + Math.random() * 0.002
  // 灌溉阈值：低于 0.30 触发
  if (state.soil_moisture < 0.30) {
    state.soil_moisture += 0.15
    state.irrigation_count++
  }
  let soil_moisture = state.soil_moisture + noise(0.005)

  // 异常注入：每 200 个周期注入 1 次温度尖峰
  if (Math.random() < 0.005) {
    temperature += 12 + Math.random() * 5
    console.log(`🔥 [${gh.name}] 注入温度尖峰: ${temperature.toFixed(1)}℃`)
  }
  // 设备掉线：每 500 周期注入一次
  if (Math.random() < 0.002) {
    state.faultUntil = Date.now() + 30000
    console.log(`⚠️ [${gh.name}] 模拟设备掉线 30s`)
  }

  return {
    greenhouse_id: gh.id,
    metrics: {
      temperature: Number(temperature.toFixed(2)),
      humidity: Number(humidity.toFixed(2)),
      light: Number(light.toFixed(0)),
      co2: Number(co2.toFixed(0)),
      soil_moisture: Number((soil_moisture * 100).toFixed(2)),
    },
    faultActive,
  }
}

// ===== 传感器 ID 映射（首次启动需要从后端查询）====
// /api/devices 需要鉴权，所以模拟器先登录拿 token
let SENSOR_MAP = null
let AUTH_TOKEN = null

async function login() {
  const { data } = await axios.post(`${API_BASE}/auth/login`, {
    email: process.env.SIM_USER || 'admin@agri.local',
    password: process.env.SIM_PASS || 'admin123',
  })
  AUTH_TOKEN = data.accessToken
  return data.userInfo
}

async function loadSensorMap() {
  try {
    const { data } = await axios.get(`${API_BASE}/devices`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    // 按 metric 分组，每个 metric 对应多个 sensor（多个采集站共享同一组指标）
    SENSOR_MAP = {}
    for (const dev of data) {
      if (dev.type !== 'sensor') continue
      for (const sensor of dev.sensors || []) {
        if (!SENSOR_MAP[sensor.metric]) SENSOR_MAP[sensor.metric] = []
        SENSOR_MAP[sensor.metric].push({ id: sensor.id, device: dev.id, name: dev.name })
      }
    }
    console.log('📡 已加载传感器:', JSON.stringify(SENSOR_MAP, null, 2))
  } catch (err) {
    console.error('❌ 加载传感器失败:', err.message)
  }
}

async function reportOnce() {
  if (!SENSOR_MAP) return
  const now = new Date()
  for (const gh of GREENHOUSES) {
    const data = generateGreenhouseData(gh, now)
    if (data.faultActive) continue
    for (const [metric, value] of Object.entries(data.metrics)) {
      // 同一 metric 下所有 sensor 全部推送（一个采集站推一个 sensor 即可，循环 N 个采集站会重复）
      // 改成：每个 greenhouse 找该 metric 下的一个 sensor
      const candidates = SENSOR_MAP[metric] || []
      // 优先取 device_id 与 greenhouse 编号最近的，避免重复
      const target = candidates[gh.id - 1] || candidates[0]
      if (!target) continue
      try {
        await axios.post(`${API_BASE}/sensor-data`, {
          sensor_id: target.id,
          value,
          ts: now.toISOString(),
        })
      } catch (err) {
        // 网络抖动不阻塞
      }
    }
    process.stdout.write(`✓ ${gh.name} `)
  }
  process.stdout.write(`[${now.toLocaleTimeString()}]\n`)
}

async function main() {
  console.log('🌱 AgriSense Simulator')
  console.log(`   API: ${API_BASE}`)
  console.log(`   Interval: ${REPORT_INTERVAL_MS}ms\n`)

  await login()
  await loadSensorMap()
  // 立即跑一次，然后定时
  await reportOnce()
  setInterval(reportOnce, REPORT_INTERVAL_MS)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})