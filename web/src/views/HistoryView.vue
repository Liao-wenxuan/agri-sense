<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent } from 'echarts/components'
import { listDevices } from '@/api/devices'
import { querySensorData, exportSensorCsv } from '@/api/sensor-data'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { useThemeStore } from '@/stores/theme'
import { injectTheme } from '@/utils/echarts-theme'

use([CanvasRenderer, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent])

const theme = useThemeStore()
const isDark = computed(() => theme.mode === 'dark')

const devices = ref<any[]>([])
const selectedDevice = ref<number | null>(null)
const selectedMetric = ref<number | null>(null)
// 默认最近 6 小时
const timeRange = ref<[string, string]>([
  dayjs().subtract(6, 'hour').toISOString(),
  dayjs().toISOString(),
])
const chartData = ref<any[]>([])

const sensorOptions = ref<any[]>([])
async function loadDevices() {
  const all = await listDevices()
  // 只保留采集站类型（带 sensors 的设备），并按最近心跳倒序（活跃的优先）
  devices.value = all
    .filter(d => d.type === 'sensor' && d.sensors && d.sensors.length > 0)
    .sort((a, b) => (b.last_heartbeat || '').localeCompare(a.last_heartbeat || ''))
  if (devices.value.length) {
    selectedDevice.value = devices.value[0].id
  }
}

watch(selectedDevice, (id) => {
  if (!id) return
  const d = devices.value.find(x => x.id === id)
  sensorOptions.value = d?.sensors || []
  selectedMetric.value = sensorOptions.value[0]?.id ?? null
})

watch([selectedMetric, timeRange], async () => {
  if (!selectedMetric.value) return
  try {
    const data = await querySensorData({
      sensor_id: selectedMetric.value,
      from: timeRange.value[0],
      to: timeRange.value[1],
      limit: 2000,
    })
    chartData.value = data
  } catch (err: any) {
    ElMessage.error(err.message)
  }
})

const currentMetricInfo = computed(() => sensorOptions.value.find(s => s.id === selectedMetric.value))
const currentDeviceName = computed(() => devices.value.find(d => d.id === selectedDevice.value)?.name || '')

const chartOption = computed(() => injectTheme({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis' },
  grid: { left: 60, right: 30, top: 36, bottom: 60 },
  xAxis: { type: 'time' },
  yAxis: { type: 'value', name: currentMetricInfo.value?.unit || '' },
  dataZoom: [
    { type: 'inside', start: 0, end: 100 },
    { type: 'slider', start: 0, end: 100 },
  ],
  series: [{
    name: currentMetricInfo.value?.metric || '',
    type: 'line',
    smooth: true,
    showSymbol: false,
    data: chartData.value.map(d => [d.ts, d.value]),
    lineStyle: { color: isDark.value ? '#22d3ee' : '#06b6d4', width: 2 },
    areaStyle: { color: isDark.value ? 'rgba(34,211,238,0.15)' : 'rgba(6,182,212,0.15)' },
  }],
}, isDark.value))

async function handleExport() {
  if (!selectedMetric.value) return
  try {
    const blob: any = await exportSensorCsv({
      sensor_id: selectedMetric.value,
      from: timeRange.value[0],
      to: timeRange.value[1],
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sensor_${selectedMetric.value}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('已导出 CSV，请在浏览器下载目录查看')
  } catch (err: any) {
    ElMessage.error('导出失败：' + (err.response?.data?.message || err.message))
  }
}

// 快捷时间范围
function setQuickRange(hours: number) {
  timeRange.value = [
    dayjs().subtract(hours, 'hour').toISOString(),
    dayjs().toISOString(),
  ]
}

onMounted(loadDevices)
</script>

<template>
  <div>
    <!-- ===== 操作说明 ===== -->
    <el-alert
      title="📖 历史数据查询使用说明"
      type="info"
      :closable="false"
      style="margin-bottom:16px"
    >
      <template #default>
        <ol style="margin:6px 0 0 18px;line-height:1.9;font-size:13px">
          <li>选择<b>设备</b>（左侧下拉），自动加载该设备的所有传感器</li>
          <li>选择<b>传感器</b>（中间下拉），图表自动刷新</li>
          <li>选择<b>时间范围</b>（右侧日期选择器），或点下方<b>快捷按钮</b></li>
          <li>鼠标滚轮缩放图表，按住拖动可框选放大</li>
          <li>点击右上<b>导出 CSV</b>，文件带 BOM，Excel 直接打开不乱码</li>
        </ol>
      </template>
    </el-alert>

    <el-card>
      <h3 class="section-title">🔍 历史数据查询</h3>

      <!-- 操作行 -->
      <el-row :gutter="12" style="margin-bottom:14px">
        <el-col :span="5">
          <div class="form-label">设备</div>
          <el-select v-model="selectedDevice" placeholder="选择设备" style="width:100%">
            <el-option v-for="d in devices" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-col>
        <el-col :span="5">
          <div class="form-label">传感器</div>
          <el-select v-model="selectedMetric" placeholder="选择传感器" style="width:100%">
            <el-option v-for="s in sensorOptions" :key="s.id" :label="`${s.metric}（${s.unit}）`" :value="s.id" />
          </el-select>
        </el-col>
        <el-col :span="9">
          <div class="form-label">时间范围</div>
          <el-date-picker v-model="timeRange" type="datetimerange" range-separator="至" style="width:100%" />
        </el-col>
        <el-col :span="5">
          <div class="form-label">&nbsp;</div>
          <el-button type="primary" @click="handleExport" style="width:100%">📥 导出 CSV</el-button>
        </el-col>
      </el-row>

      <!-- 快捷时间按钮 -->
      <div style="margin-bottom:14px">
        <span style="color:#64748b;font-size:13px;margin-right:8px">快捷时间：</span>
        <el-button size="small" @click="setQuickRange(1)">最近 1 小时</el-button>
        <el-button size="small" @click="setQuickRange(6)">最近 6 小时</el-button>
        <el-button size="small" @click="setQuickRange(24)">最近 24 小时</el-button>
        <el-button size="small" @click="setQuickRange(168)">最近 7 天</el-button>
      </div>

      <!-- 状态提示 -->
      <div v-if="currentMetricInfo" style="margin-bottom:12px;padding:10px 14px;background:#f0f9ff;border-radius:6px;font-size:13px;color:#0c4a6e">
        📌 当前：<b>{{ currentDeviceName }}</b> · {{ currentMetricInfo.metric }} · {{ currentMetricInfo.unit }} · 共 <b>{{ chartData.length }}</b> 个数据点
      </div>

      <!-- 图表 -->
      <div class="chart-box" style="height:480px">
        <v-chart :option="chartOption" :update-options="{ notMerge: true }" autoresize />
      </div>
    </el-card>

    <!-- ===== 导出文件格式说明 ===== -->
    <el-alert
      title="📥 导出 CSV 格式说明"
      type="success"
      :closable="false"
      style="margin-top:16px"
    >
      <template #default>
        <div style="font-size:13px;line-height:1.9">
          <p style="margin:6px 0"><b>文件结构</b>：<code>ts, metric, unit, value, quality_flag</code> 5 列</p>
          <p style="margin:6px 0"><b>质量标记</b>：<code>quality_flag = 1</code> 正常 · <code>0</code> 无效 · <code>2</code> 算法检测异常</p>
          <p style="margin:6px 0"><b>Excel 打开</b>：CSV 文件带 UTF-8 BOM，Excel/WPS 直接打开不乱码（中文"℃"等也会正常）</p>
          <p style="margin:6px 0"><b>文件名</b>：<code>sensor_{传感器ID}_{时间戳}.csv</code>，例如 <code>sensor_13_20260915_143022.csv</code></p>
        </div>
      </template>
    </el-alert>
  </div>
</template>

<style scoped>
.form-label {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 4px;
}
.chart-box {
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 14px;
  color: var(--text-1);
  transition: background-color 0.25s ease;
}
</style>