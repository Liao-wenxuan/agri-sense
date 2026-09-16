import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// 数据库文件路径（DB_PATH 优先，否则项目根的 data/agri.db）
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/agri.db')
const dataDir = path.dirname(dbPath)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
console.log(`📦 DB path: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// =============== 用户表 ===============
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// =============== 农场/大棚/设备 ===============
db.exec(`
  CREATE TABLE IF NOT EXISTS farms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    owner_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS greenhouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farm_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    crop_type TEXT,
    area REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    greenhouse_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,                       -- sensor / controller
    status TEXT DEFAULT 'offline',             -- online / offline / fault
    last_heartbeat DATETIME,
    capabilities TEXT,                          -- JSON: 控制能力列表
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (greenhouse_id) REFERENCES greenhouses(id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    metric TEXT NOT NULL,                       -- temperature / humidity / soil_moisture / light / co2
    unit TEXT NOT NULL,
    range_min REAL,
    range_max REAL,
    FOREIGN KEY (device_id) REFERENCES devices(id)
  )
`)

// =============== 时序数据 ===============
db.exec(`
  CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id INTEGER NOT NULL,
    value REAL NOT NULL,
    ts DATETIME NOT NULL,
    quality_flag INTEGER DEFAULT 1,             -- 0=无效 1=正常 2=异常
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  )
`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_sensor_data_sensor_ts ON sensor_data(sensor_id, ts)`)

// =============== 告警 ===============
db.exec(`
  CREATE TABLE IF NOT EXISTS alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id INTEGER NOT NULL,
    metric TEXT NOT NULL,
    op TEXT NOT NULL,                           -- > / < / >= / <= / ==
    threshold REAL NOT NULL,
    severity TEXT DEFAULT 'medium',             -- low / medium / high / critical
    channels TEXT,                              -- JSON: ['websocket', 'email']
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER,
    sensor_id INTEGER NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    threshold REAL,
    severity TEXT,
    status TEXT DEFAULT 'pending',               -- pending / ack / resolved / ignored
    message TEXT,
    handled_by INTEGER,
    handled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES alert_rules(id),
    FOREIGN KEY (sensor_id) REFERENCES sensors(id),
    FOREIGN KEY (handled_by) REFERENCES users(id)
  )
`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, created_at)`)

// =============== 算法异常记录 ===============
db.exec(`
  CREATE TABLE IF NOT EXISTS anomaly_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id INTEGER NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    z_score REAL NOT NULL,
    window_mean REAL,
    window_std REAL,
    window_size INTEGER,
    severity TEXT DEFAULT 'medium',            -- low | medium | high
    method TEXT DEFAULT 'zscore',              -- zscore | iforest
    ts DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sensor_id) REFERENCES sensors(id)
  )
`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_anomaly_sensor_ts ON anomaly_records(sensor_id, ts)`)

// =============== 控制日志 ===============
db.exec(`
  CREATE TABLE IF NOT EXISTS control_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    params TEXT,
    result TEXT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id)
  )
`)

console.log('✅ DB connected:', dbPath)

export default db