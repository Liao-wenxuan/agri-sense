<script setup lang="ts">
/**
 * AlgorithmView 简化版（评委友好）
 * - 顶部说明卡片
 * - 主图：异常点高亮 + 阈值线 + Z 区间阴影
 * - 右侧：实时 Z + IForest 分数（大数字）
 * - 下方：Z-Score vs IForest 对比表 + 异常记录
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, ScatterChart, BarChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent,
} from 'echarts/components'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { listDevices } from '@/api/devices'
import { querySensorData } from '@/api/sensor-data'
import { getRecentAnomalies, getDetectorState, resetDetector, getAllIForest, getAnomalyStats } from '@/api/anomaly'
import { useRealtimeStore } from '@/stores/realtime'
import { useThemeStore } from '@/stores/theme'
import { injectTheme } from '@/utils/echarts-theme'

use([CanvasRenderer, LineChart, ScatterChart, BarChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent,
  MarkLineComponent, MarkAreaComponent])

const rt = useRealtimeStore()
const theme = useThemeStore()
const isDark = computed(() => theme.mode === 'dark')
const METRIC_NAME: Record<string, string> = {
  temperature: '空气温度', humidity: '空气湿度', soil_moisture: '土壤湿度',
  light: '光照强度', co2: 'CO₂浓度',
}

const RULE_THRESHOLD: Record<string, { op: string; value: number }> = {
  temperature:   { op: '>',  value: 32 },
  humidity:      { op: '<',  value: 30 },
  soil_moisture: { op: '<',  value: 25 },
  co2:           { op: '>',  value: 1200 },
}

const devices = ref<any[]>([])
const sensorOptions = ref<any[]>([])
const selectedSensorId = ref<number | null>(null)
const timeRange = ref<[string, string]>([
  dayjs().subtract(2, 'hour').toISOString(),
  dayjs().toISOString(),
])

const dataPoints = ref<any[]>([])
const anomalies = ref<any[]>([])
const detectorInfo = ref<any>(null)
const iforestList = ref<any[]>([])
const statsData = ref<any[]>([])
const methodFilter = ref<'all' | 'zscore' | 'iforest'>('all')

async function loadDevices() {
  devices.value = await listDevices()
  if (devices.value.length) {
    selectedSensorId.value = devices.value[0].id
  }
}

watch(selectedSensorId, async (id) => {
  if (!id) return
  const dev = devices.value.find(d => d.id === id)
  sensorOptions.value = dev?.sensors || []
  const tempSensor = sensorOptions.value[0]
  if (tempSensor) {
    await loadSensorData(tempSensor.id)
    await loadDetector(tempSensor.id)
  }
})

async function loadSensorData(sensorId: number) {
  try {
    const data = await querySensorData({
      sensor_id: sensorId,
      from: timeRange.value[0],
      to: timeRange.value[1],
      limit: 2000,
    })
    dataPoints.value = data
  } catch (err: any) { ElMessage.error(err.message) }
}

async function loadDetector(sensorId: number) {
  try { detectorInfo.value = await getDetectorState(sensorId) } catch {}
}

async function loadAnomalies() {
  const [all, iforests, stats] = await Promise.all([
    getRecentAnomalies({ limit: 50 }),
    getAllIForest(),
    getAnomalyStats(),
  ])
  anomalies.value = all
  iforestList.value = iforests
  statsData.value = stats
}

async function handleReset() {
  if (!sensorOptions.value[0]) return
  try {
    await resetDetector(sensorOptions.value[0].id)
    ElMessage.success('已重新加载历史窗口')
    await loadAnomalies()
  } catch (err: any) { ElMessage.error(err.message) }
}

const currentSensor = computed(() => sensorOptions.value[0])
const currentMetric = computed(() => currentSensor.value?.metric || '')

const chartOption = computed(() => {
  const sensor = currentSensor.value
  if (!sensor) return {}
  const unit = sensor.unit
  const ruleTh = RULE_THRESHOLD[sensor.metric]

  // 异常点（按 sensor.metric 过滤，zscore 标蓝、iforest 标紫）
  const zscorePoints = anomalies.value
    .filter(a => a.metric === sensor.metric && (a.method || 'zscore') === 'zscore')
    .map(a => ({ ts: a.ts, value: a.value, z: a.z_score }))
  const iforestPoints = anomalies.value
    .filter(a => a.metric === sensor.metric && a.method === 'iforest')
    .map(a => ({ ts: a.ts, value: a.value, z: a.z_score }))

  // markLines
  const markLines: any[] = []
  if (ruleTh) {
    markLines.push({
      yAxis: ruleTh.value,
      name: `规则阈值 ${ruleTh.op}${ruleTh.value}`,
      label: { formatter: `规则 ${ruleTh.op}${ruleTh.value}${unit}`, color: '#ef4444', position: 'end' },
      lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
    })
  }

  return injectTheme({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['原始数据', 'Z-Score 异常', 'IForest 异常'], textStyle: { color: isDark.value ? '#c9d1d9' : '#64748b' }, top: 4 },
    grid: { left: 60, right: 30, top: 40, bottom: 60 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: unit },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100 },
    ],
    series: [
      {
        name: '原始数据',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: dataPoints.value.map(p => [p.ts, p.value]),
        lineStyle: { color: isDark.value ? '#22d3ee' : '#06b6d4', width: 2 },
        areaStyle: { color: isDark.value ? 'rgba(34,211,238,0.1)' : 'rgba(6,182,212,0.1)' },
        markLine: { silent: false, data: markLines, symbol: 'none' },
      },
      {
        name: 'Z-Score 异常',
        type: 'scatter',
        data: zscorePoints.map(a => [a.ts, a.value]),
        symbolSize: 12,
        itemStyle: { color: isDark.value ? '#38bdf8' : '#0ea5e9', borderColor: isDark.value ? '#161b22' : '#fff', borderWidth: 2 },
      },
      {
        name: 'IForest 异常',
        type: 'scatter',
        data: iforestPoints.map(a => [a.ts, a.value]),
        symbolSize: 14,
        symbol: 'diamond',
        itemStyle: { color: isDark.value ? '#c4b5fd' : '#a78bfa', borderColor: isDark.value ? '#161b22' : '#fff', borderWidth: 2 },
      },
    ],
  }, isDark.value)
})

const liveZScore = computed(() => selectedSensorId.value ? rt.anomalyScores[selectedSensorId.value] : null)
const liveIForestScore = computed(() => selectedSensorId.value ? rt.iforestScores[selectedSensorId.value] : null)

const filteredAnomalies = computed(() => {
  if (methodFilter.value === 'all') return anomalies.value
  return anomalies.value.filter(a => (a.method || 'zscore') === methodFilter.value)
})

let refreshTimer: any
onMounted(async () => {
  await loadDevices()
  await loadAnomalies()
  refreshTimer = setInterval(async () => {
    if (currentSensor.value) {
      await loadSensorData(currentSensor.value.id)
      await loadAnomalies()
    }
  }, 15000)
})
onUnmounted(() => clearInterval(refreshTimer))
</script>

<template>
  <div>
    <!-- ===== 顶部说明 ===== -->
    <el-alert
      title="🧠 算法效果对比 - Z-Score 滑动窗口 vs Isolation Forest"
      type="info"
      :closable="false"
      style="margin-bottom:16px"
    >
      <template #default>
        <div style="font-size:13px;line-height:1.9">
          每个传感器维护最近 100 个点的窗口，计算 <b>Z-Score</b> = (value - mean) / std，|z| &gt; 阈值视为异常。
          <b>IForest</b> 用随机切分特征空间，路径短的点视为孤立异常（多变量场景）。
          本页面展示两算法在同一时间窗口的检出差异。
        </div>
      </template>
    </el-alert>

    <!-- ===== 工具栏 ===== -->
    <el-row :gutter="12" style="margin-bottom:14px">
      <el-col :span="8">
        <div class="form-label">设备</div>
        <el-select v-model="selectedSensorId" placeholder="选择设备" style="width:100%">
          <el-option v-for="d in devices" :key="d.id" :label="`${d.name}（${d.greenhouse_name}）`" :value="d.id" />
        </el-select>
      </el-col>
      <el-col :span="10">
        <div class="form-label">时间范围</div>
        <el-date-picker v-model="timeRange" type="datetimerange" range-separator="至" style="width:100%" />
      </el-col>
      <el-col :span="6">
        <div class="form-label">&nbsp;</div>
        <el-button type="primary" @click="handleReset" style="width:100%">🔄 重置算法窗口</el-button>
      </el-col>
    </el-row>

    <!-- ===== 主图 + 实时分数（左右等宽） ===== -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="16">
        <el-card>
          <h3 class="section-title">
            📈 实时算法效果（{{ currentMetric ? METRIC_NAME[currentMetric] : '' }}）
            <span style="margin-left:auto;font-size:12px;color:#64748b">
              青色=数据 · 蓝圆点=Z-Score 异常 · 紫菱形=IForest 异常 · 红红=虚线=规则阈值
            </span>
          </h3>
          <div style="height:420px">
            <v-chart :option="chartOption" :update-options="{ notMerge: true }" autoresize />
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card>
          <h3 class="section-title">🎯 实时算法检测</h3>

          <!-- Z-Score -->
          <div v-if="liveZScore" class="algo-card zscore">
            <div class="algo-header">
              <strong class="algo-title">📐 Z-Score 滑动窗口</strong>
              <el-tag v-if="liveZScore.isAnomaly" :type="liveZScore.severity === 'high' ? 'danger' : 'warning'" size="small">
                ⚠️ {{ liveZScore.severity }}
              </el-tag>
              <el-tag v-else type="success" size="small">✓ 正常</el-tag>
            </div>
            <div class="algo-val">
              {{ liveZScore.zScore?.toFixed(2) }}<span class="algo-unit">σ</span>
            </div>
            <div class="algo-meta">
              当前 {{ liveZScore.value?.toFixed(2) }} · 窗口 {{ detectorInfo?.window_size || '-' }}/100 · 阈值 {{ detectorInfo?.cfg?.zThreshold || '-' }}
            </div>
          </div>

          <el-divider style="margin: 10px 0" />

          <!-- IForest -->
          <div v-if="liveIForestScore" class="algo-card iforest">
            <div class="algo-header">
              <strong class="algo-title">🌲 Isolation Forest</strong>
              <el-tag v-if="liveIForestScore.isAnomaly" :type="liveIForestScore.severity === 'high' ? 'danger' : 'warning'" size="small">
                ⚠️ {{ liveIForestScore.severity }}
              </el-tag>
              <el-tag v-else type="success" size="small">✓ 正常</el-tag>
            </div>
            <div class="algo-val">
              {{ liveIForestScore.score?.toFixed(2) }}<span class="algo-unit">/ 1.0</span>
            </div>
            <div class="algo-meta">
              路径 {{ liveIForestScore.pathLength?.toFixed(1) }} · 越接近 1 越异常 · 训练 64 样本
            </div>
          </div>
          <div v-else style="font-size:12px;color:#94a3b8;padding:8px 0">⏳ IForest 训练中（≥10 个点）...</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 检测器列表 + 统计（左右等宽 12 列） ===== -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="12">
        <el-card>
          <h3 class="section-title">🌲 IForest 检测器</h3>
          <el-table :data="iforestList" stripe size="small" height="280">
            <el-table-column prop="sensor_id" label="传感器" width="100" />
            <el-table-column label="指标" min-width="140">
              <template #default="{ row }">{{ METRIC_NAME[row.metric] || row.metric }}</template>
            </el-table-column>
            <el-table-column prop="trees" label="已建树" width="100">
              <template #default="{ row }">{{ row.trees }} 棵</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <el-tag type="success" size="small">✓ 已就绪</el-tag>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <h3 class="section-title">📊 算法检出统计（近 7 天）</h3>
          <el-table :data="statsData" stripe size="small" height="280">
            <el-table-column label="方法" width="100">
              <template #default="{ row }">
                <el-tag :type="row.method === 'iforest' ? 'warning' : 'primary'" size="small">
                  {{ row.method === 'iforest' ? '🌲 IForest' : '📐 Z-Score' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="指标" min-width="100">
              <template #default="{ row }">{{ METRIC_NAME[row.metric] || row.metric }}</template>
            </el-table-column>
            <el-table-column prop="total" label="总数" width="80" sortable />
            <el-table-column prop="high_count" label="高" width="70">
              <template #default="{ row }"><span style="color:#ef4444;font-weight:600">{{ row.high_count }}</span></template>
            </el-table-column>
            <el-table-column prop="medium_count" label="中" width="70">
              <template #default="{ row }"><span style="color:#f59e0b">{{ row.medium_count }}</span></template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 异常记录 ===== -->
    <el-card>
      <h3 class="section-title">
        🚨 检测到的异常点（实时推送）
        <span style="margin-left:auto">
          <el-radio-group v-model="methodFilter" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="zscore">📐 Z-Score</el-radio-button>
            <el-radio-button value="iforest">🌲 IForest</el-radio-button>
          </el-radio-group>
        </span>
      </h3>
      <el-table :data="filteredAnomalies" stripe size="small" height="380">
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ new Date(row.ts).toLocaleString('zh-CN', { hour12: false }) }}</template>
        </el-table-column>
        <el-table-column label="方法" width="100">
          <template #default="{ row }">
            <el-tag :type="(row.method || 'zscore') === 'iforest' ? 'warning' : 'primary'" size="small">
              {{ (row.method || 'zscore') === 'iforest' ? '🌲 IForest' : '📐 Z-Score' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="指标" width="120">
          <template #default="{ row }">{{ METRIC_NAME[row.metric] || row.metric }}</template>
        </el-table-column>
        <el-table-column label="实测值" width="100">
          <template #default="{ row }">{{ row.value.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="分数" width="110">
          <template #default="{ row }">
            <strong :style="{ color: (row.method || 'zscore') === 'iforest' ? '#a78bfa' : '#0ea5e9' }">
              {{ (row.method || 'zscore') === 'iforest' ? row.z_score.toFixed(3) : row.z_score.toFixed(2) }}
            </strong>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="row.severity === 'high' ? 'danger' : row.severity === 'medium' ? 'warning' : 'info'" size="small">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.form-label {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.algo-card {
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  transition: background-color 0.25s ease;
}
.algo-card.zscore  { border-left: 3px solid var(--accent); }
.algo-card.iforest { border-left: 3px solid #a78bfa; }
.algo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.algo-title  { color: var(--text-1); font-size: 13px; }
.algo-val    { font-size: 38px; font-weight: 800; color: var(--text-1); line-height: 1; margin: 4px 0; }
.algo-unit   { font-size: 14px; color: var(--text-4); margin-left: 4px; font-weight: 400; }
.algo-meta   { font-size: 11px; color: var(--text-4); margin-top: 4px; }
</style>