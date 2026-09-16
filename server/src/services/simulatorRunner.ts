/**
 * 内置 Simulator（生产容器内同进程跑）
 * - 通过环境变量 SIMULATOR=true 启用
 * - 每 5s 推送 3 个采集站 × 5 metric
 * - 偶发注入温度尖峰
 * - 使用 Node 18+ 原生 fetch，无需 axios
 */
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 3000}/api`
const INTERVAL = parseInt(process.env.SIMULATOR_INTERVAL || '5000', 10)

const GREENHOUSES = [
  { id: 1, name: 'A1棚（番茄）',  tempBase: 24 },
  { id: 2, name: 'A2棚（黄瓜）',  tempBase: 26 },
  { id: 3, name: 'A3棚（草莓）',  tempBase: 18 },
]

const states: Record<number, { soil_moisture: number; faultUntil: number }> = {}
function getState(ghId: number) {
  if (!states[ghId]) states[ghId] = { soil_moisture: 0.55 + Math.random() * 0.1, faultUntil: 0 }
  return states[ghId]
}
function diurnalSin(hour: number, peakHour: number, minVal: number, maxVal: number) {
  const phase = ((hour - peakHour) / 24) * 2 * Math.PI
  return minVal + ((Math.cos(phase) + 1) / 2) * (maxVal - minVal)
}
function daylight(hour: number) {
  if (hour < 6 || hour > 18) return 0
  return Math.sin(((hour - 6) / 12) * Math.PI) * 1000
}
function noise(std = 0.5) {
  const u = Math.random(), v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std
}

function generate(gh: typeof GREENHOUSES[number], now: Date) {
  const hour = now.getHours() + now.getMinutes() / 60
  const state = getState(gh.id)
  let temperature = diurnalSin(hour, 14, 22, 35) + noise(0.6)
  let humidity = diurnalSin(hour, 4, 50, 85) - (temperature - 22) * 0.8 + noise(2)
  humidity = Math.max(20, Math.min(100, humidity))
  let light = Math.max(0, daylight(hour) + noise(20))
  let co2 = 400 + Math.max(0, diurnalSin(hour, 9, 0, 800) - light * 0.3) + noise(30)
  state.soil_moisture -= 0.001 + Math.random() * 0.002
  if (state.soil_moisture < 0.30) state.soil_moisture += 0.15
  let soil_moisture = state.soil_moisture + noise(0.005)
  if (Math.random() < 0.005) {
    temperature += 12 + Math.random() * 5
    console.log(`🔥 [${gh.name}] 注入温度尖峰: ${temperature.toFixed(1)}℃`)
  }
  return {
    temperature: Number(temperature.toFixed(2)),
    humidity: Number(humidity.toFixed(2)),
    light: Number(light.toFixed(0)),
    co2: Number(co2.toFixed(0)),
    soil_moisture: Number((soil_moisture * 100).toFixed(2)),
  }
}

let SENSOR_MAP: Record<string, Array<{ id: number; device: number }>> = {}
let TOKEN = ''

async function login() {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SIM_USER || 'admin@agri.local',
      password: process.env.SIM_PASS || 'admin123',
    }),
  })
  const data: any = await r.json()
  TOKEN = data.accessToken
}

async function loadSensorMap() {
  const r = await fetch(`${API_BASE}/devices`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  const data: any = await r.json()
  SENSOR_MAP = {}
  for (const dev of data) {
    if (dev.type !== 'sensor') continue
    for (const sensor of dev.sensors || []) {
      if (!SENSOR_MAP[sensor.metric]) SENSOR_MAP[sensor.metric] = []
      SENSOR_MAP[sensor.metric].push({ id: sensor.id, device: dev.id })
    }
  }
  console.log('📡 Simulator 已加载:', Object.keys(SENSOR_MAP).map(k => `${k}×${SENSOR_MAP[k].length}`).join(', '))
}

async function tick() {
  if (!Object.keys(SENSOR_MAP).length) return
  const now = new Date()
  for (const gh of GREENHOUSES) {
    const data = generate(gh, now)
    for (const [metric, value] of Object.entries(data)) {
      const candidates = SENSOR_MAP[metric] || []
      const target = candidates[gh.id - 1] || candidates[0]
      if (!target) continue
      try {
        await fetch(`${API_BASE}/sensor-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
          body: JSON.stringify({ sensor_id: target.id, value, ts: now.toISOString() }),
        })
      } catch {}
    }
  }
}

let timer: any

export async function startSimulator() {
  try {
    await login()
    await loadSensorMap()
  } catch (e: any) {
    console.error('❌ Simulator 启动失败（1s 后重试）:', e.message)
    setTimeout(startSimulator, 1000)
    return
  }
  setTimeout(async () => {
    await tick()
    timer = setInterval(tick, INTERVAL)
    console.log(`🤖 Simulator 已启动，间隔 ${INTERVAL}ms`)
  }, 1000)
}

export function stopSimulator() {
  if (timer) clearInterval(timer)
}
