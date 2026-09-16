<script setup lang="ts">
/**
 * DashboardBigView - 全屏暗色大屏视图
 *
 * 风格参照 OSI_PPT_Refactored：
 * - 深色 #0D1117 + cyan grid + 两个 glow orb
 * - 农业色强调：green + teal + orange
 *
 * 接入真实数据：
 * - KPI / 5 大指标：getStats + getLatest
 * - 多大棚温度对比：querySensorData 多源
 * - 实时 Z-Score：Socket.io anomaly_score 事件
 * - 设备列表：listDevices
 * - 告警：listAlerts + Socket.io alert
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent,
} from 'echarts/components'
import dayjs from 'dayjs'
import { listDevices, getStats, getLatest } from '@/api/devices'
import { listAlerts } from '@/api/alerts'
import { querySensorData } from '@/api/sensor-data'
import { useRealtimeStore } from '@/stores/realtime'

use([CanvasRenderer, LineChart, BarChart, PieChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent])

const stats = ref<any>({})
const latest = ref<any[]>([])
const devices = ref<any[]>([])
const alerts = ref<any[]>([])
const multiBayTemp = ref<Record<string, any[]>>({})
const rt = useRealtimeStore()
const now = ref(Date.now())

let timer: any
onMounted(async () => {
  await refresh()
  timer = setInterval(async () => {
    now.value = Date.now()
    try {
      stats.value = await getStats()
      latest.value = await getLatest()
      alerts.value = await listAlerts({ limit: 8 })
    } catch {}
  }, 8000)
})
onUnmounted(() => clearInterval(timer))

async function refresh() {
  const [s, l, d, a] = await Promise.all([getStats(), getLatest(), listDevices(), listAlerts({ limit: 8 })])
  stats.value = s
  latest.value = l
  devices.value = d
  alerts.value = a

  // 拉每个大棚的温度 sensor 最近 60 个点
  const tempSensors = l.filter(x => x.metric === 'temperature')
  for (const ts of tempSensors.slice(0, 4)) {
    try {
      const data = await querySensorData({
        sensor_id: ts.sensor_id,
        from: dayjs().subtract(2, 'hour').toISOString(),
        to: dayjs().toISOString(),
        limit: 60,
      })
      multiBayTemp.value[`bay_${ts.device_id}`] = data
    } catch {}
  }
}

// 5 个核心环境指标（按 metric 取平均）
const METRIC_DEF: Record<string, { label: string; unit: string; icon: string; min: number; max: number }> = {
  temperature:    { label: '空气温度', unit: '℃',   icon: '🌡️', min: 0, max: 50 },
  humidity:       { label: '空气湿度', unit: '%',   icon: '💧', min: 0, max: 100 },
  soil_moisture:  { label: '土壤湿度', unit: '%',   icon: '🌱', min: 0, max: 100 },
  light:          { label: '光照强度', unit: 'lux', icon: '☀️', min: 0, max: 1500 },
  co2:            { label: 'CO₂ 浓度', unit: 'ppm', icon: '🌫️', min: 300, max: 2000 },
}
const envCards = computed(() => {
  const groups: Record<string, number[]> = {}
  latest.value.forEach(d => {
    if (!groups[d.metric]) groups[d.metric] = []
    groups[d.metric].push(d.value)
  })
  return Object.entries(METRIC_DEF).map(([key, def]) => {
    const arr = groups[key] || []
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const inRange = avg >= def.min && avg <= def.max
    return { key, ...def, value: avg, status: inRange ? 'normal' : 'warning' }
  })
})

// 多大棚温度对比图
const tempChartOption = computed(() => {
  const series = Object.entries(multiBayTemp.value).map(([key, data], i) => ({
    name: key.replace('bay_', '棚 '),
    type: 'line',
    smooth: true,
    showSymbol: false,
    data: data.map(d => [d.ts, d.value]),
    lineStyle: { color: ['#22C55E', '#FB923C', '#A78BFA', '#22D3EE'][i % 4], width: 2 },
  }))
  // 加阈值线
  series.push({
    name: '高温阈值 32℃',
    type: 'line',
    markLine: {
      silent: true,
      data: [{ yAxis: 32, label: { formatter: '32℃', color: '#EF4444' }, lineStyle: { color: '#EF4444', type: 'dashed' } }],
    },
    data: [],
  } as any)
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#C9D1D9' }, top: 0 },
    grid: { left: 50, right: 20, top: 36, bottom: 30 },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: '#1E2530' } }, axisLabel: { color: '#8B949E' } },
    yAxis: { type: 'value', name: '℃', axisLine: { lineStyle: { color: '#1E2530' } }, axisLabel: { color: '#8B949E' }, splitLine: { lineStyle: { color: '#1E2530' } } },
    series,
  }
})

// 设备状态饼图
const devicePieOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, textStyle: { color: '#C9D1D9' } },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    label: { color: '#C9D1D9' },
    data: [
      { name: '在线', value: stats.value?.devices?.online || 0, itemStyle: { color: '#22C55E' } },
      { name: '离线', value: stats.value?.devices?.offline || 0, itemStyle: { color: '#64748B' } },
      { name: '故障', value: stats.value?.devices?.fault || 0, itemStyle: { color: '#EF4444' } },
    ],
  }],
}))

// 实时折线（最近 anomaly_score 数据）
const realtimeChartOption = computed(() => {
  const data = rt.latestData.slice(0, 80).reverse()
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: '#1E2530' } }, axisLabel: { color: '#8B949E' } },
    yAxis: { type: 'value', axisLine: { lineStyle: { color: '#1E2530' } }, axisLabel: { color: '#8B949E' }, splitLine: { lineStyle: { color: '#1E2530' } } },
    series: [{
      type: 'line', smooth: true, showSymbol: false,
      data: data.map(d => [d.ts, d.value]),
      lineStyle: { color: '#00D9FF', width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
        { offset: 0, color: 'rgba(0,217,255,0.4)' }, { offset: 1, color: 'rgba(0,217,255,0)' },
      ]}},
    }],
  }
})

// Z-Score 实时数据（来自 socket.io anomaly_score）
const liveScores = computed(() => Object.values(rt.anomalyScores || {}).slice(-5))
</script>

<template>
  <div class="big-screen">
    <!-- 背景 orb -->
    <div class="orb orb-1" />
    <div class="orb orb-2" />

    <!-- 顶部 -->
    <header class="bs-header">
      <div class="bs-title">
        <div class="bs-logo">🌱</div>
        <div>
          <h1>AgriSense · 智慧农业环境监测大屏</h1>
          <div class="bs-sub">SMART GREENHOUSE MONITORING · 川农智慧农场 · 雅安基地</div>
        </div>
      </div>
      <div class="bs-meta">
        <span><span class="dot" /> 数据流正常</span>
        <span class="bs-clock">{{ new Date(now).toLocaleTimeString() }}</span>
        <span class="bs-date">{{ new Date(now).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}</span>
      </div>
    </header>

    <!-- KPI 4 卡 -->
    <section class="bs-kpi">
      <div class="bs-kpi-card">
        <div class="bs-kpi-label">在线设备</div>
        <div class="bs-kpi-val">{{ stats?.devices?.online || 0 }}<span class="bs-kpi-unit">/ {{ stats?.devices?.total || 0 }}</span></div>
      </div>
      <div class="bs-kpi-card warn">
        <div class="bs-kpi-label">待处理告警</div>
        <div class="bs-kpi-val">{{ stats?.alerts?.pending || 0 }}</div>
      </div>
      <div class="bs-kpi-card danger">
        <div class="bs-kpi-label">严重告警</div>
        <div class="bs-kpi-val">{{ stats?.alerts?.critical || 0 }}</div>
      </div>
      <div class="bs-kpi-card cyan">
        <div class="bs-kpi-label">近 1h 数据点</div>
        <div class="bs-kpi-val">{{ stats?.dataPoints?.total || 0 }}</div>
      </div>
    </section>

    <!-- 5 大环境指标 -->
    <section class="bs-env">
      <div v-for="m in envCards" :key="m.key" class="bs-env-card" :class="m.status">
        <div class="bs-env-icon">{{ m.icon }}</div>
        <div class="bs-env-label">{{ m.label }}</div>
        <div class="bs-env-val">{{ m.value.toFixed(1) }}<span class="bs-env-unit">{{ m.unit }}</span></div>
        <div class="bs-env-range">{{适宜区间}} {{ m.min }} ~ {{ m.max }}{{ m.unit }}</div>
      </div>
    </section>

    <!-- 主图表区 -->
    <section class="bs-charts">
      <div class="bs-card bs-card-wide">
        <div class="bs-card-title">📈 多大棚温度实时对比</div>
        <v-chart :option="tempChartOption" style="height: 280px" autoresize />
      </div>

      <div class="bs-card">
        <div class="bs-card-title">🖥️ 设备状态分布</div>
        <v-chart :option="devicePieOption" style="height: 280px" autoresize />
      </div>
    </section>

    <!-- 第二行：实时流 + 告警 + 设备 -->
    <section class="bs-charts">
      <div class="bs-card bs-card-wide">
        <div class="bs-card-title">📊 实时数据流（Socket.io 推送）</div>
        <v-chart :option="realtimeChartOption" style="height: 240px" autoresize />
      </div>

      <div class="bs-card">
        <div class="bs-card-title">🚨 最近告警</div>
        <div class="bs-alert-list">
          <div v-for="a in alerts" :key="a.id" class="bs-alert-item" :class="a.severity">
            <div class="bs-alert-title">{{ a.message }}</div>
            <div class="bs-alert-meta">{{ a.created_at }} · {{ a.severity }}</div>
          </div>
          <div v-if="!alerts.length" class="bs-empty">暂无告警</div>
        </div>
      </div>

      <div class="bs-card">
        <div class="bs-card-title">📋 设备列表</div>
        <div class="bs-device-list">
          <div v-for="d in devices.slice(0, 8)" :key="d.id" class="bs-device-item">
            <span class="bs-dot" :class="d.status" />
            <span class="bs-device-name">{{ d.name }}</span>
            <span class="bs-device-meta">{{ d.greenhouse_name }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部 -->
    <footer class="bs-footer">
      数据采集频率 5s · Z-Score 实时检测 · Isolation Forest 异常发现 · Socket.io 实时推送
    </footer>
  </div>
</template>

<style scoped>
.big-screen {
  min-height: 100vh;
  background: #0D1117;
  color: #F0F6FC;
  padding: 18px 24px;
  position: relative;
  overflow-x: hidden;
}
.orb {
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
  animation: orbFloat 8s ease-in-out infinite;
}
.orb-1 { width: 480px; height: 480px; background: radial-gradient(circle, rgba(0,217,255,0.18), transparent 70%); top: -120px; left: -120px; }
.orb-2 { width: 520px; height: 520px; background: radial-gradient(circle, rgba(167,139,250,0.12), transparent 70%); bottom: -180px; right: -160px; animation-delay: -3s; }
@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0); }
  50%      { transform: translate(30px, -30px); }
}

.big-screen > * { position: relative; z-index: 1; }

/* ===== Header ===== */
.bs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid #1E2530;
  margin-bottom: 18px;
}
.bs-title { display: flex; align-items: center; gap: 14px; }
.bs-logo {
  width: 48px; height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #22C55E, #2DD4BF);
  display: grid; place-items: center;
  font-size: 26px;
  box-shadow: 0 4px 24px rgba(34, 197, 94, 0.4);
}
.bs-title h1 { font-size: 22px; font-weight: 700; letter-spacing: 1px; margin: 0; }
.bs-sub { font-size: 12px; color: #8B949E; letter-spacing: 2px; margin-top: 2px; }
.bs-meta { display: flex; gap: 18px; align-items: center; font-size: 13px; color: #C9D1D9; }
.bs-meta .dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #22C55E;
  box-shadow: 0 0 8px #22C55E;
  margin-right: 6px;
  animation: pulse 1.4s infinite;
}
.bs-clock { font-family: 'Courier New', monospace; color: #00D9FF; font-weight: 700; font-size: 16px; }
.bs-date { color: #8B949E; }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

/* ===== KPI ===== */
.bs-kpi {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
.bs-kpi-card {
  background: #161B22;
  border-radius: 12px;
  padding: 16px 22px;
  border-left: 4px solid #22C55E;
}
.bs-kpi-card.warn   { border-left-color: #FB923C; }
.bs-kpi-card.danger { border-left-color: #EF4444; }
.bs-kpi-card.cyan   { border-left-color: #00D9FF; }
.bs-kpi-label { font-size: 13px; color: #8B949E; letter-spacing: 1px; }
.bs-kpi-val   { font-size: 38px; font-weight: 900; margin-top: 6px; line-height: 1; }
.bs-kpi-unit  { font-size: 16px; color: #8B949E; margin-left: 4px; font-weight: 400; }

/* ===== Env ===== */
.bs-env {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
.bs-env-card {
  background: #161B22;
  border-radius: 12px;
  padding: 22px 18px;
  text-align: center;
  border-top: 3px solid #2DD4BF;
  transition: transform 0.3s;
}
.bs-env-card:hover { transform: translateY(-3px); }
.bs-env-card.warning { border-top-color: #FB923C; }
.bs-env-card.normal  { border-top-color: #22C55E; }
.bs-env-icon  { font-size: 32px; margin-bottom: 6px; }
.bs-env-label { font-size: 13px; color: #8B949E; letter-spacing: 1px; }
.bs-env-val   { font-size: 44px; font-weight: 900; margin: 4px 0; line-height: 1; }
.bs-env-unit  { font-size: 14px; color: #8B949E; margin-left: 4px; }
.bs-env-range { font-size: 11px; color: #8B949E; margin-top: 6px; }

/* ===== Charts ===== */
.bs-charts {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
}
.bs-charts:has(.bs-card:nth-child(3)) {
  grid-template-columns: 2fr 1fr 1fr;
}
.bs-card {
  background: #161B22;
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid #1E2530;
}
.bs-card-wide { grid-column: span 1; }
.bs-card-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  color: #F0F6FC;
  display: flex;
  align-items: center;
  gap: 8px;
}
.bs-card-title::before {
  content: '';
  width: 3px; height: 16px;
  background: #00D9FF;
  border-radius: 2px;
}

/* ===== Alert list ===== */
.bs-alert-list { display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
.bs-alert-item {
  background: rgba(239,68,68,0.08);
  border-left: 3px solid #EF4444;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
}
.bs-alert-item.warning { background: rgba(251,146,60,0.08); border-left-color: #FB923C; }
.bs-alert-item.high    { background: rgba(239,68,68,0.12); border-left-color: #EF4444; }
.bs-alert-title { color: #F0F6FC; font-weight: 500; margin-bottom: 2px; }
.bs-alert-meta  { color: #8B949E; font-size: 11px; }
.bs-empty { color: #64748B; text-align: center; padding: 40px 0; font-size: 13px; }

/* ===== Device list ===== */
.bs-device-list { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.bs-device-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.03);
  border-radius: 6px;
  font-size: 12px;
}
.bs-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.bs-dot.online  { background: #22C55E; box-shadow: 0 0 6px #22C55E; }
.bs-dot.offline { background: #8B949E; }
.bs-dot.fault   { background: #EF4444; animation: pulse 1.2s infinite; }
.bs-device-name { color: #F0F6FC; font-weight: 500; }
.bs-device-meta { color: #8B949E; margin-left: auto; font-size: 11px; }

/* ===== Footer ===== */
.bs-footer {
  text-align: center;
  font-size: 12px;
  color: #8B949E;
  padding: 14px 0;
  border-top: 1px solid #1E2530;
  letter-spacing: 1px;
}

@media (max-width: 1280px) {
  .bs-env    { grid-template-columns: repeat(3, 1fr); }
  .bs-kpi    { grid-template-columns: repeat(2, 1fr); }
  .bs-charts { grid-template-columns: 1fr; }
}
</style>