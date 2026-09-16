# 🌱 AgriSense - 智慧农业环境监测平台

> **比赛项目** · 四川农业大学 软件赛道二 · 物联网智能应用开发（仅软件开发）
> **技术栈**：Vue 3 + Vite + Element Plus + Pinia + ECharts + Socket.io | Node.js + Express + better-sqlite3 + JWT + Socket.io
> **代码风格**：复用 `content-sharing-platform` 阶段 5 的登录注册实现

---

## 📁 项目结构

```
agri-sense/
├── server/                   # 后端服务（Express + SQLite）
│   ├── src/
│   │   ├── index.ts          # 主入口（HTTP + Socket.io）
│   │   ├── lib/db.ts         # SQLite 9 张表建表
│   │   ├── lib/config.ts     # 环境变量
│   │   ├── middleware/auth.ts # JWT 鉴权中间件
│   │   ├── routes/
│   │   │   ├── auth.ts       # 注册/登录/me（**复用 content-sharing-platform 风格**）
│   │   │   ├── farms.ts      # 农场 + 大棚管理
│   │   │   ├── devices.ts    # 设备 + 远程控制
│   │   │   ├── sensor-data.ts# 数据上报 + 查询 + CSV 导出
│   │   │   ├── alerts.ts     # 告警 + 规则
│   │   │   └── stats.ts      # 大屏汇总 + 最新数据
│   │   └── services/
│   │       ├── alertEngine.ts# 告警规则引擎（实时触发）
│   │       └── mailer.ts     # 邮件告警（可选）
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── web/                      # 前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── main.ts           # Element Plus + Pinia + 路由
│   │   ├── App.vue
│   │   ├── styles/main.css   # 农业绿主题
│   │   ├── api/              # Axios 封装 + 业务 API
│   │   ├── stores/           # Pinia stores（含持久化 + Socket.io）
│   │   ├── router/           # 路由守卫（未登录拦截）
│   │   └── views/
│   │       ├── LoginView.vue
│   │       ├── RegisterView.vue
│   │       ├── LayoutView.vue    # 侧边栏布局
│   │       ├── DashboardView.vue # 大屏总览（核心）
│   │       ├── DevicesView.vue   # 设备管理 + 远程控制
│   │       ├── HistoryView.vue   # 历史数据 + CSV 导出
│   │       └── AlertsView.vue    # 告警中心 + 规则配置
│   ├── index.html
│   ├── vite.config.ts        # 含 /api 和 /socket.io 代理
│   └── package.json
│
├── simulator/                # IoT 设备模拟器
│   ├── simulator.js          # 物理模型生成数据，5s 上报一次
│   └── seed.js               # 初始化用户/农场/大棚/设备/规则
│
├── data/
│   ├── generate_dataset.py   # 合成 30 天 × 4 bay 数据集（Kaggle 模式）
│   ├── analyze.py            # 数据分析 + 清洗建议 + 阈值建议
│   └── synthetic_greenhouse_30days_4bays.csv  # 生成的数据集
│
├── docs/
│   ├── 01-需求文档.md         # 需求规格说明书
│   ├── 02-技术架构.md         # 技术架构图 + 实现方案
│   └── dashboard-prototype.html  # 高保真 Dashboard 原型
│
└── README.md
```

---

## 🚀 快速启动

### 0. 环境

- Node.js ≥ 18（实测 v24）
- Python ≥ 3.10（实测 3.14）
- PowerShell（Windows）

### 1. 后端

```bash
cd server
npm install
cp .env.example .env       # 可选：配置 SMTP 邮件
npm run dev                # http://localhost:3000
```

### 2. 初始化数据（必须）

```bash
cd simulator
npm install
node seed.js               # 创建 admin@agri.local / admin123 + 3 个大棚 + 设备 + 告警规则
```

### 3. 启动模拟器（持续上报数据）

```bash
node simulator.js          # 每 5s 上报一次数据到后端
```

### 4. 前端

```bash
cd web
npm install
npm run dev                # http://localhost:5173
```

登录账号：`admin@agri.local` / `admin123`

---

## 🧪 数据集生成与分析

```bash
cd data
python generate_dataset.py   # 生成 synthetic_greenhouse_30days_4bays.csv（17,280 行）
python analyze.py            # 描述性 + 异常值 + 清洗建议 + 阈值建议
```

---

## 🎯 系统功能（对应赛题 5 项要求）

| 赛题要求 | 实现位置 | 状态 |
|---|---|---|
| ① 设备注册/在线监测/远程控制/故障记录 | `routes/devices.ts` + `DevicesView.vue` | ✅ |
| ② 传感器实时采集/清洗/历史查询/导出 | `routes/sensor-data.ts` + `simulator.js` + `HistoryView.vue` | ✅ |
| ③ 异常告警（≥2 种渠道）+ 记录可追溯 | `services/alertEngine.ts` + `mailer.ts` + Socket.io | ✅（站内信+邮件） |
| ④ 算法嵌入业务流程 | 服务端 `alertEngine.ts` 实时调用 | ✅（阈值规则，可加 Z-Score） |
| ⑤ 前端可视化展示 | `DashboardView.vue` + `chart`（ECharts） | ✅ |

---

## 📊 Dashboard 大屏原型

打开 `docs/dashboard-prototype.html` 查看高保真原型。已实现：
- 实时时钟 + 连接状态
- 4 张 KPI 卡（设备/告警/数据点）
- 5 大环境指标大数字
- 多大棚温度对比折线图（含阈值线）
- 设备状态列表
- 告警滚动列表
- 远程控制面板（开通/关闭设备）

风格参照 OSI_PPT_Refactored：深色 `#0D1117` + cyan grid + glow orb。

---

## 🔐 测试账号

| 账号 | 密码 | 角色 |
|---|---|---|
| admin@agri.local | admin123 | 管理员（首个注册用户） |

---

## 📦 提交物清单（比赛用）

- [x] ✅ 完整源代码（关键代码有注释）
- [x] ✅ 可运行的应用程序（`npm run dev` 三件套）
- [x] ✅ 软件设计文档：`docs/01-需求文档.md` + `docs/02-技术架构.md`
- [x] ✅ 项目展示 PPT（用 dashboard-prototype.html 截图）
- [ ] ⏳ 成果展示视频（待录制）
- [ ] ⏳ 算法设计报告（待 W4 写）

---

## 🎁 简历复用价值

完成后可写：
- **实时数据可视化**（ECharts + Socket.io）— 大厂高频考点
- **物联网时序数据处理**（数据清洗 + 异常检测）— 阿里/字节 IoT 方向加分
- **全栈项目**（Vue3 + Express + SQLite + JWT）— 展示独立交付能力
- **算法工程化落地**（嵌入业务流程 + 可视化）— 区别于"只调包"的候选人

---

## 🛠️ 后续 TODO（W2-W4）

- [ ] W2：完成所有页面联调 + 接口边界
- [ ] W3：大屏真实数据接入（替换 mock）
- [ ] W3：算法集成（Z-Score 异常检测 + 对比图）
- [ ] W4：PPT + 视频 + 测试报告
- [ ] W4：邮件告警真实投递测试