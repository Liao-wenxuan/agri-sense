<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listDevices, controlDevice } from '@/api/devices'

const devices = ref<any[]>([])
const filterGreenhouse = ref<number | undefined>()
const filterStatus = ref<string>('')

async function load() {
  devices.value = await listDevices({
    greenhouse_id: filterGreenhouse.value,
    status: filterStatus.value || undefined,
  })
}

async function handleControl(device: any, action: string, target: string) {
  try {
    await controlDevice(device.id, { action, target })
    ElMessage.success(`${device.name}：${action} ${target} 已下发`)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '控制失败')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <el-card>
      <h3 class="section-title">设备列表</h3>
      <el-row :gutter="16" style="margin-bottom:16px">
        <el-col :span="8">
          <el-select v-model="filterStatus" placeholder="状态筛选" clearable @change="load" style="width:100%">
            <el-option label="在线" value="online" />
            <el-option label="离线" value="offline" />
            <el-option label="故障" value="fault" />
          </el-select>
        </el-col>
        <el-col :span="8">
          <el-button @click="load">刷新</el-button>
        </el-col>
      </el-row>

      <el-table :data="devices" stripe>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <span class="online-dot" :class="row.status" />
            {{ row.status }}
          </template>
        </el-table-column>
        <el-table-column prop="name" label="设备名" width="160" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="greenhouse_name" label="所属大棚" width="140" />
        <el-table-column label="传感器">
          <template #default="{ row }">
            <el-tag v-for="s in row.sensors" :key="s.id" size="small" style="margin-right:6px">
              {{ s.metric }} ({{ s.unit }})
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_heartbeat" label="最近心跳" width="180" />
        <el-table-column label="远程控制" width="320">
          <template #default="{ row }">
            <el-button-group>
              <el-button size="small" type="primary" @click="handleControl(row, 'turn_on', 'fan')">开通风扇</el-button>
              <el-button size="small" @click="handleControl(row, 'turn_off', 'fan')">关闭风扇</el-button>
              <el-button size="small" type="success" @click="handleControl(row, 'turn_on', 'pump')">开通水泵</el-button>
              <el-button size="small" :type="'warning'" @click="handleControl(row, 'turn_on', 'light')">开补光灯</el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>