# 🚀 AgriSense 部署指南

单 Docker 镜像同时 serve **Vue 静态前端** + **Express API** + **Socket.io** + **SQLite**。

---

## 🎯 三种部署方式

### 方式一：Render（最推荐 · 5 分钟上线）

**优点**：自动 HTTPS、自定义域名、磁盘持久化、免费起步

1. **代码推到 GitHub**（必须）
   ```bash
   cd agri-sense
   git init && git add . && git commit -m "init"
   git remote add origin https://github.com/Liao-wenxuan/agri-sense.git
   git push -u origin main
   ```

2. **Render 控制台** → https://dashboard.render.com → `New +` → `Blueprint`
   - 连 GitHub 仓库 `Liao-wenxuan/agri-sense`
   - Render 自动识别 `render.yaml` 并部署
   - 等 3-5 分钟 build

3. **访问**：会得到 `https://agri-sense.onrender.com`，全球可访问
   - 免费版 15 分钟无访问会冷启动（约 30s）
   - Starter 套餐（$7/月）无冷启动

4. **可选**：自定义域名（CNAME 解析到 `agri-sense.onrender.com`）

---

### 方式二：Railway（$5 免费额度 · 部署最简）

1. **推到 GitHub**（同上）
2. **Railway 控制台** → https://railway.app → `New Project` → `Deploy from GitHub repo`
3. 选 `agri-sense` 仓库
4. Railway 自动检测 Dockerfile
5. **Variables** 加：
   - `JWT_SECRET` = 任意 32+ 字符串
   - `SIMULATOR` = `true`
6. **Settings** → **Volumes** → 添加 `/app/data` 持久卷
7. **Deploy** → 等待 → 获得 `https://agri-sense.up.railway.app`

---

### 方式三：本地 Docker（最简单 · 仅本机/局域网）

需要先装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
cd agri-sense
docker compose up -d --build
```

访问 http://localhost:3000

**局域网访问**（让评委/同学通过 WiFi 访问）：
- 找你的局域网 IP：`ipconfig` → IPv4 (192.168.x.x)
- 评委/同学访问：`http://192.168.x.x:3000`
- 注意 Windows 防火墙要放行 3000 端口

---

## 🧪 部署后烟测清单

访问部署的 URL：

| URL | 应该看到 |
|---|---|
| `/` | AgriSense 登录页 |
| 登录 `admin@agri.local` / `admin123` | 进 Dashboard |
| Dashboard | 5 个环境指标卡片 + 实时数据流折线图（5 条曲线） |
| 历史数据 | 选 A1/A2/A3 都有曲线（387+ 点） |
| 算法对比 | 青色折线 + 蓝圆点（Z 异常）+ 紫菱形（IForest 异常） |
| `/api/health` | JSON `{"status":"ok"}` |
| 浏览器 DevTools Console | `Socket.io connected` |

---

## ⚙️ 关键环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `PORT` | 否 | 3000 | HTTP 端口 |
| `NODE_ENV` | 否 | development | 生产设 `production` |
| `DB_PATH` | ✅ | `./data/agri.db` | SQLite 文件路径，**用 Volume 持久化** |
| `JWT_SECRET` | ✅ | dev 占位 | JWT 签名密钥，**生产必须改** |
| `SIMULATOR` | 否 | false | `true` 时同进程跑模拟器，5s/次推 15 个 sensor |
| `SIMULATOR_INTERVAL` | 否 | 5000 | 推送间隔（ms） |

---

## 📂 数据持久化

### 本地 Docker
数据在 `agri-sense-data` named volume，可备份/迁移。

### Render
挂在 `/var/data`，1GB 起步，redeploy 不会丢数据。

### Railway
需要在 Settings → Volumes 手动挂 `/app/data`，否则重启丢数据。

### 迁移数据
```bash
# 导出
docker run --rm -v agri-sense-data:/data -v $PWD:/backup \
  alpine tar czf /backup/agri-data.tar.gz -C /data .

# 导入
docker run --rm -v agri-sense-data:/data -v $PWD:/backup \
  alpine tar xzf /backup/agri-data.tar.gz -C /data
```

---

## 🔧 常见问题

### Q: 部署后看不到数据？
A: 默认 `SIMULATOR=false`，数据库是空的。在环境变量加 `SIMULATOR=true` 重新部署，或先在本地 `npm run seed` 后上传数据库。

### Q: 想要带 17,280 行历史数据？
A: 在本地 `npm run seed` 跑一次（生成测试数据），然后把 `data/agri.db` 复制到 Volume 挂载点。

### Q: Render 免费版 15 分钟冷启动太慢？
A: 升 Starter ($7/月)，或用 Railway 免费额度 ($5/月 充足)。

### Q: 自定义域名？
A: Render: Settings → Custom Domain → 加 CNAME。Railway: Settings → Domains → 加。

### Q: HTTPS？
A: Render/Railway/Vercel 都自动配 Let's Encrypt，无需手动。

---

## 📊 资源占用

- **镜像大小**：~250 MB（node:20-alpine + better-sqlite3 编译）
- **运行内存**：~150 MB（空载） / ~250 MB（simulator 跑 + 5 个 socket 连接）
- **CPU**：空载 < 5%，5s 推送周期尖峰 ~15%
- **磁盘**：SQLite 1 万行 ~ 5 MB，10 万行 ~ 50 MB
