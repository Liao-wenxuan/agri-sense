<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent, GraphicComponent,
} from 'echarts/components'
import { getStats, getLatest, listDevices } from '@/api/devices'
import { listAlerts } from '@/api/alerts'
import { useRealtimeStore } from '@/stores/realtime'
import { useThemeStore } from '@/stores/theme'
import { injectTheme } from '@/utils/echarts-theme'

use([CanvasRenderer, LineChart, BarChart, PieChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent, GraphicComponent])

const stats = ref<any>({})
const latest = ref<any[]>([])
const devices = ref<any[]>([])
const alerts = ref<any[]>([])
const rt = useRealtimeStore()
const theme = useThemeStore()
const isDark = computed(() => theme.mode === 'dark')
const tick = ref(Date.now())

let timer: any
onMounted(async () => {
  await refresh()
  timer = setInterval(async () => {
    tick.value = Date.now()
    try { stats.value = await getStats() } catch {}
  }, 10000)
})
onUnmounted(() => clearInterval(timer))

async function refresh() {
  const [s, l, d, a] = await Promise.all([getStats(), getLatest(), listDevices(), listAlerts({ limit: 10 })])
  stats.value = s
  latest.value = l
  devices.value = d
  alerts.value = a
}

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
    return { key, ...def, value: avg.toFixed(1), status: inRange ? 'normal' : 'warning' }
  })
})

const lineOption = computed(() => {
  // 把混合数据按 metric 分组，每个 metric 一条曲线（按 metric 自动归一化显示）
  const data = rt.latestData.slice(0, 200).reverse()
  const groups: Record<string, { name: string; color: string; points: any[] }> = {
    temperature:   { name: '空气温度',   color: '#ef4444', points: [] },
    humidity:      { name: '空气湿度',   color: '#3b82f6', points: [] },
    soil_moisture: { name: '土壤湿度',   color: '#a855f7', points: [] },
    light:         { name: '光照强度',   color: '#f59e0b', points: [] },
    co2:           { name: 'CO₂浓度',  color: '#10b981', points: [] },
  }
  data.forEach(d => {
    if (groups[d.metric]) groups[d.metric].points.push([d.ts, d.value])
  })
  const series = Object.entries(groups)
    .filter(([, g]) => g.points.length > 0)
    .map(([key, g]) => ({
      name: g.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: g.points,
      lineStyle: { color: g.color, width: 1.8 },
      itemStyle: { color: g.color },
      emphasis: { focus: 'series' },
    }))
  return injectTheme({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 36, bottom: 30 },
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: isDark.value ? '#c9d1d9' : '#64748b' }, top: 4 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', scale: true },
    series,
  }, isDark.value)
})

const devicePieOption = computed(() => {
  const online = stats.value?.devices?.online || 0
  const offline = stats.value?.devices?.offline || 0
  const fault = stats.value?.devices?.fault || 0
  const total = online + offline + fault
  const textColor = isDark.value ? '#f0f6fc' : '#0f172a'
  return injectTheme({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} 台 ({d}%)' },
    legend: { bottom: 0, textStyle: { color: isDark.value ? '#c9d1d9' : '#475569', fontSize: 12 } },
    series: [{
      name: '设备状态',
      type: 'pie',
      radius: ['38%', '62%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: isDark.value ? '#161b22' : '#fff', borderWidth: 2 },
      label: { show: true, position: 'outside', color: textColor, fontSize: 12, formatter: '{b}\n{c}台' },
      labelLine: { length: 8, length2: 8 },
      data: [
        { name: '在线', value: online, itemStyle: { color: isDark.value ? '#34d399' : '#22c55e' } },
        { name: '离线', value: offline, itemStyle: { color: isDark.value ? '#6e7681' : '#94a3b8' } },
        { name: '故障', value: fault, itemStyle: { color: isDark.value ? '#f87171' : '#ef4444' } },
      ],
    }],
    graphic: total > 0 ? [{
      type: 'text',
      left: 'center',
      top: '38%',
      style: { text: `${total}\n台`, fill: textColor, fontSize: 22, fontWeight: 700, textAlign: 'center' },
    }] : [],
  }, isDark.value)
})
</script>

<template>
  <div>
    <!-- 顶部 4 张 KPI 卡（CSS Grid 等宽） -->
    <div class="kpi-grid">
      <div class="metric-card">
        <div class="metric-label">🖥️ 在线设备</div>
        <div class="metric-value">{{ stats?.devices?.online || 0 }}<span class="metric-unit">/ {{ stats?.devices?.total || 0 }}</span></div>
        <div class="metric-trend">实时</div>
      </div>
      <div class="metric-card" :class="{ warning: (stats?.alerts?.pending || 0) > 0, danger: (stats?.alerts?.critical || 0) > 0 }">
        <div class="metric-label">🚨 待处理告警</div>
        <div class="metric-value">{{ stats?.alerts?.pending || 0 }}</div>
        <div class="metric-trend">需关注</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">📊 近 1h 数据点</div>
        <div class="metric-value">{{ stats?.dataPoints?.total || 0 }}</div>
        <div class="metric-trend">持续采集</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">⏱️ 最近更新</div>
        <div class="metric-value" style="font-size:22px">{{ new Date(stats?.timestamp || Date.now()).toLocaleTimeString() }}</div>
        <div class="metric-trend">自动刷新 10s</div>
      </div>
    </div>

    <!-- 5 个环境指标（CSS Grid 等宽） -->
    <div class="env-grid">
      <div v-for="m in envCards" :key="m.key" class="metric-card" :class="m.status">
        <div class="metric-label">{{ m.icon }} {{ m.label }}</div>
        <div class="metric-value">{{ m.value }}<span class="metric-unit">{{ m.unit }}</span></div>
        <div class="metric-trend">适宜区间 {{ m.min }} ~ {{ m.max }}</div>
      </div>
    </div>

    <!-- 主图表 + 设备饼图 -->
    <el-row :gutter="16" style="margin-bottom:18px">
      <el-col :span="16">
        <div class="chart-box">
          <h3 class="section-title">📈 实时数据流（最近 100 个点）</h3>
          <v-chart :option="lineOption" :update-options="{ notMerge: true }" style="height:320px" autoresize />
        </div>
      </el-col>
      <el-col :span="8">
        <div class="chart-box">
          <h3 class="section-title">🖥️ 设备状态分布</h3>
          <v-chart :option="devicePieOption" :update-options="{ notMerge: true }" style="height:320px" autoresize />
        </div>
      </el-col>
    </el-row>

    <!-- 最近告警 -->
    <div class="chart-box" style="height:auto">
      <h3 class="section-title">🚨 最近告警（实时推送）</h3>
      <el-table :data="alerts" stripe size="small">
        <el-table-column prop="id" label="#" width="60" />
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ new Date(row.created_at).toLocaleString('zh-CN', { hour12: false }) }}</template>
        </el-table-column>
        <el-table-column prop="metric" label="指标" width="100" />
        <el-table-column label="详情" min-width="200">
          <template #default="{ row }">{{ row.message }}</template>
        </el-table-column>
        <el-table-column prop="severity" label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="row.severity === 'critical' ? 'danger' : row.severity === 'high' ? 'warning' : 'info'" size="small">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'pending' ? 'danger' : 'success'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
/* ===== 卡片统一宽度 ===== */
.kpi-grid,
.env-grid {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}
.kpi-grid { grid-template-columns: repeat(4, 1fr); }
.env-grid { grid-template-columns: repeat(5, 1fr); }

.metric-card {
  background: var(--bg-card);
  border-radius: 10px;
  padding: 18px 20px;
  box-shadow: var(--shadow);
  border-left: 4px solid var(--primary);
  transition: transform 0.2s, box-shadow 0.2s, background-color 0.25s ease;
  min-height: 110px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: var(--text-1);
}
.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-strong);
}
.metric-card.warning { border-left-color: var(--warning); }
.metric-card.danger  { border-left-color: var(--danger); }
.metric-card.normal  { border-left-color: var(--success); }

.metric-label  { color: var(--text-3); font-size: 13px; margin-bottom: 6px; }
.metric-value  { font-size: 28px; font-weight: 700; color: var(--text-1); line-height: 1; }
.metric-unit   { font-size: 14px; color: var(--text-4); margin-left: 4px; font-weight: 400; }
.metric-trend  { font-size: 11px; color: var(--text-4); margin-top: 8px; }

@media (max-width: 1280px) {
  .env-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 960px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .env-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>