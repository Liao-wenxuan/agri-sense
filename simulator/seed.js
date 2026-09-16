/**
 * 初始化测试数据：用户、农场、大棚、设备、传感器、告警规则
 * 使用方法：先注册一个用户拿到 user_id，然后修改下方常量后运行 `node seed.js`
 */
const axios = require('axios')

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

async function api(method, url, data, config = {}) {
  const res = await axios({ method, url: `${API_BASE}${url}`, data, ...config })
  return res.data
}

async function main() {
  console.log('🌱 开始初始化测试数据...')

  // 1. 注册管理员
  let token, userId
  try {
    const reg = await api('POST', '/auth/register', {
      email: 'admin@agri.local',
      password: 'admin123',
      nickname: '农场管理员',
    })
    token = reg.accessToken
    userId = reg.userInfo.id
    console.log(`✓ 创建用户: ${reg.userInfo.email} (id=${userId})`)
  } catch (err) {
    if (err.response?.status === 409) {
      console.log('  用户已存在，登录中...')
      const login = await api('POST', '/auth/login', { email: 'admin@agri.local', password: 'admin123' })
      token = login.accessToken
      userId = login.userInfo.id
    } else {
      throw err
    }
  }

  const auth = { headers: { Authorization: `Bearer ${token}` } }

  // 2. 创建农场
  const farm = await api('POST', '/farms', { name: '川农智慧农场', address: '四川·雅安' }, auth)
  console.log(`✓ 创建农场: id=${farm.id}`)

  // 3. 创建 3 个大棚
  const greenhouses = []
  for (const cfg of [
    { name: 'A1-番茄棚', crop: 'tomato',     area: 240 },
    { name: 'A2-黄瓜棚', crop: 'cucumber',   area: 200 },
    { name: 'A3-草莓棚', crop: 'strawberry', area: 180 },
  ]) {
    const gh = await api('POST', '/farms/greenhouses', { farm_id: farm.id, ...cfg }, auth)
    greenhouses.push({ ...gh, ...cfg })
    console.log(`✓ 创建大棚: ${cfg.name} id=${gh.id}`)
  }

  // 4. 每个大棚创建 1 个传感器设备（含 5 类传感器）
  const sensorIds = {}
  for (const gh of greenhouses) {
    const dev = await api('POST', '/devices', {
      greenhouse_id: gh.id,
      name: `${gh.name}-采集站`,
      type: 'sensor',
      capabilities: ['read'],
      sensors: [
        { metric: 'temperature',    unit: '℃',   range_min: -10, range_max: 50 },
        { metric: 'humidity',       unit: '%',   range_min: 0,   range_max: 100 },
        { metric: 'soil_moisture',  unit: '%',   range_min: 0,   range_max: 100 },
        { metric: 'light',          unit: 'lux', range_min: 0,   range_max: 1500 },
        { metric: 'co2',            unit: 'ppm', range_min: 300, range_max: 2000 },
      ],
    }, auth)
    console.log(`✓ 创建设备: ${gh.name}-采集站 id=${dev.id}`)

    // 查询设备拿到 sensor IDs
    const detail = await api('GET', `/devices/${dev.id}`, null, auth)
    detail.sensors.forEach(s => { sensorIds[s.metric] = s.id })
  }

  // 5. 给每个大棚创建控制器（通风/水泵/补光）
  for (const gh of greenhouses) {
    for (const cap of [
      { type: 'controller', name: `${gh.name}-通风扇`, capabilities: ['fan_on', 'fan_off'] },
      { type: 'controller', name: `${gh.name}-灌溉泵`, capabilities: ['pump_on', 'pump_off'] },
      { type: 'controller', name: `${gh.name}-补光灯`, capabilities: ['light_on', 'light_off'] },
    ]) {
      await api('POST', '/devices', {
        greenhouse_id: gh.id,
        name: cap.name,
        type: cap.type,
        capabilities: cap.capabilities,
      }, auth)
    }
  }
  console.log('✓ 控制器已创建')

  // 6. 创建告警规则
  const ruleConfigs = [
    { metric: 'temperature',   op: '>',  threshold: 32, severity: 'high',     channels: ['websocket', 'email'] },
    { metric: 'temperature',   op: '<',  threshold: 10, severity: 'critical', channels: ['websocket', 'email'] },
    { metric: 'humidity',      op: '<',  threshold: 30, severity: 'medium',   channels: ['websocket'] },
    { metric: 'soil_moisture', op: '<',  threshold: 25, severity: 'high',     channels: ['websocket', 'email'] },
    { metric: 'co2',           op: '>',  threshold: 1200, severity: 'medium', channels: ['websocket'] },
  ]
  for (const r of ruleConfigs) {
    if (!sensorIds[r.metric]) continue
    await api('POST', '/alerts/rules', { sensor_id: sensorIds[r.metric], ...r }, auth)
  }
  console.log(`✓ 创建告警规则: ${ruleConfigs.length} 条`)

  console.log('\n🎉 初始化完成！')
  console.log('   登录账号: admin@agri.local / admin123')
}

main().catch(err => {
  console.error('❌ 初始化失败:', err.response?.data || err.message)
  process.exit(1)
})