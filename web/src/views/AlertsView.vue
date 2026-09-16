<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listAlerts, handleAlert, listAlertRules } from '@/api/alerts'

const alerts = ref<any[]>([])
const rules = ref<any[]>([])
const showRuleDialog = ref(false)
const ruleForm = ref({ sensor_id: null, metric: 'temperature', op: '>', threshold: 30, severity: 'high', channels: ['websocket', 'email'] })

async function load() {
  alerts.value = await listAlerts({ limit: 100 })
  rules.value = await listAlertRules()
}

async function doHandle(row: any, action: string) {
  try {
    await handleAlert(row.id, action)
    ElMessage.success('处理成功')
    await load()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  }
}

async function addRule() {
  try {
    const { createAlertRule } = await import('@/api/alerts')
    await createAlertRule(ruleForm.value)
    ElMessage.success('规则已添加')
    showRuleDialog.value = false
    await load()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '添加失败')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <el-card style="margin-bottom:18px">
      <h3 class="section-title">
        告警规则
        <el-button size="small" type="primary" style="margin-left:auto" @click="showRuleDialog = true">+ 新增规则</el-button>
      </h3>
      <el-table :data="rules" stripe size="small">
        <el-table-column prop="id" label="#" width="60" />
        <el-table-column prop="sensor_id" label="传感器ID" width="100" />
        <el-table-column prop="metric" label="指标" width="120" />
        <el-table-column label="条件">
          <template #default="{ row }">{{ row.op }} {{ row.threshold }}</template>
        </el-table-column>
        <el-table-column prop="severity" label="等级" width="100" />
        <el-table-column label="渠道">
          <template #default="{ row }">
            <el-tag v-for="c in JSON.parse(row.channels || '[]')" :key="c" size="small" style="margin-right:4px">{{ c }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card>
      <h3 class="section-title">告警记录</h3>
      <el-table :data="alerts" stripe>
        <el-table-column prop="id" label="#" width="60" />
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column prop="metric" label="指标" width="120" />
        <el-table-column prop="message" label="详情" />
        <el-table-column prop="severity" label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="row.severity === 'critical' ? 'danger' : row.severity === 'high' ? 'warning' : 'info'" size="small">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'pending' ? 'danger' : 'success'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" @click="doHandle(row, 'ack')">确认</el-button>
            <el-button v-if="row.status !== 'resolved'" size="small" type="success" @click="doHandle(row, 'resolve')">已处理</el-button>
            <el-button v-if="row.status === 'pending'" size="small" type="info" @click="doHandle(row, 'ignore')">忽略</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增规则弹窗 -->
    <el-dialog v-model="showRuleDialog" title="新增告警规则" width="500">
      <el-form label-width="100">
        <el-form-item label="传感器ID">
          <el-input-number v-model="ruleForm.sensor_id" :min="1" />
        </el-form-item>
        <el-form-item label="指标">
          <el-select v-model="ruleForm.metric">
            <el-option label="温度" value="temperature" />
            <el-option label="湿度" value="humidity" />
            <el-option label="土壤湿度" value="soil_moisture" />
            <el-option label="光照" value="light" />
            <el-option label="CO2" value="co2" />
          </el-select>
        </el-form-item>
        <el-form-item label="条件">
          <el-select v-model="ruleForm.op" style="width:30%">
            <el-option label=">" value=">" />
            <el-option label=">=" value=">=" />
            <el-option label="<" value="<" />
            <el-option label="<=" value="<=" />
          </el-select>
          <el-input-number v-model="ruleForm.threshold" style="width:65%;margin-left:5%" />
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="ruleForm.severity">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
            <el-option label="严重" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="通知渠道">
          <el-checkbox-group v-model="ruleForm.channels">
            <el-checkbox value="websocket">站内信</el-checkbox>
            <el-checkbox value="email">邮件</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRuleDialog = false">取消</el-button>
        <el-button type="primary" @click="addRule">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>