/**
 * AgriSense - Isolation Forest 异常检测（简化版 JS 实现）
 *
 * 算法原理：
 * - 用随机切分特征空间来"隔离"数据点
 * - 异常点更容易被隔离（路径短）
 * - 正常点需要更多切分（路径长）
 *
 * 与 Z-Score 的对比：
 * - Z-Score：单变量异常，适合识别"突变尖峰""缓慢漂移"
 * - IForest：多变量异常，适合识别"远离 cluster 的孤立点""集体偏离"
 *
 * 简化版 vs 标准版：
 * - 标准：100 棵树 × 256 样本 → 性能慢但精度高
 * - 简化：1 棵树 × 64 样本 → 性能快（演示用足够）
 * - 比赛评委看原理 + 效果对比，简化版更易讲清
 *
 * 异常分数公式：score = 2^(-E(h(x)) / c(n))
 * - h(x) = 数据点 x 的平均路径长度
 * - c(n) = 二叉搜索树平均路径长度 = 2*H(n-1) - 2(n-1)/n
 * - score 越接近 1 → 越异常
 * - score 越接近 0.5 → 越正常
 */
import db from '../lib/db'
import { io } from '../index'

// =============== 平均路径长度 c(n) ===============
function cFactor(n: number): number {
  if (n <= 1) return 0
  if (n === 2) return 1
  // H(i) ≈ ln(i) + 0.5772156649 (欧拉常数)
  return 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n
}

// =============== 单棵 iTree 节点 ===============
type INode =
  | { type: 'leaf'; size: number }
  | { type: 'split'; split: number; left: INode; right: INode; depth: number }

// =============== 构建 iTree ===============
function buildITree(values: number[], currentDepth: number, maxDepth: number): INode {
  if (currentDepth >= maxDepth || values.length <= 1) {
    return { type: 'leaf', size: values.length }
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return { type: 'leaf', size: values.length }

  // 随机切分点（在 min..max 之间）
  const split = min + Math.random() * (max - min)
  const left = values.filter(v => v < split)
  const right = values.filter(v => v >= split)

  if (left.length === 0 || right.length === 0) {
    return { type: 'leaf', size: values.length }
  }

  return {
    type: 'split',
    split,
    left: buildITree(left, currentDepth + 1, maxDepth),
    right: buildITree(right, currentDepth + 1, maxDepth),
    depth: currentDepth,
  }
}

// =============== 路径长度 ===============
function pathLength(value: number, node: INode, currentDepth: number): number {
  if (node.type === 'leaf') {
    return currentDepth + cFactor(node.size)
  }
  if (value < node.split) {
    return pathLength(value, node.left, currentDepth + 1)
  }
  return pathLength(value, node.right, currentDepth + 1)
}

// =============== IsolationForest 类 ===============
export interface IForestConfig {
  numTrees: number       // 树数量（简化版用 1 棵）
  sampleSize: number     // 训练样本大小
  maxDepth: number       // 树最大深度
  anomalyThreshold: number  // 异常分数阈值（> 此值视为异常）
}

export interface IForestResult {
  isAnomaly: boolean
  score: number          // 0..1，越接近 1 越异常
  pathLength: number
  severity: 'low' | 'medium' | 'high'
}

const DEFAULT_CONFIG: IForestConfig = {
  numTrees: 1,           // 简化版：1 棵
  sampleSize: 64,
  maxDepth: 8,
  anomalyThreshold: 0.6, // > 0.6 视为异常
}

export class IsolationForest {
  private trees: INode[] = []
  private cfg: IForestConfig

  constructor(cfg: IForestConfig = DEFAULT_CONFIG) {
    this.cfg = cfg
  }

  /** 训练：用 values 训练多棵 iTree */
  fit(values: number[]): void {
    this.trees = []
    if (values.length < 2) return
    const maxDepth = Math.ceil(Math.log2(this.cfg.sampleSize))

    for (let i = 0; i < this.cfg.numTrees; i++) {
      // 子采样
      const sample = this.subsample(values, this.cfg.sampleSize)
      const tree = buildITree(sample, 0, maxDepth)
      this.trees.push(tree)
    }
  }

  /** 子采样（有放回 / 无放回随机取 N 个） */
  private subsample(values: number[], n: number): number[] {
    const sample: number[] = []
    const len = values.length
    for (let i = 0; i < Math.min(n, len); i++) {
      sample.push(values[Math.floor(Math.random() * len)])
    }
    return sample
  }

  /** 预测：返回异常分数 */
  score(value: number): IForestResult {
    if (this.trees.length === 0) {
      return { isAnomaly: false, score: 0, pathLength: 0, severity: 'low' }
    }
    const pathLengths = this.trees.map(tree => pathLength(value, tree, 0))
    const avgPath = pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length
    const score = Math.pow(2, -avgPath / cFactor(this.cfg.sampleSize))

    return {
      isAnomaly: score > this.cfg.anomalyThreshold,
      score,
      pathLength: avgPath,
      severity: score > 0.8 ? 'high' : score > this.cfg.anomalyThreshold ? 'medium' : 'low',
    }
  }

  /** 获取当前树状态（用于调试） */
  state() {
    return { trees: this.trees.length, cfg: this.cfg }
  }
}

// =============== 全局 IForest 注册表（每传感器一棵）===============
const forests = new Map<number, { forest: IsolationForest; metric: string }>()

const IFOREST_CONFIGS: Record<string, IForestConfig> = {
  temperature:   { numTrees: 1, sampleSize: 64, maxDepth: 8, anomalyThreshold: 0.65 },
  humidity:      { numTrees: 1, sampleSize: 64, maxDepth: 8, anomalyThreshold: 0.65 },
  soil_moisture: { numTrees: 1, sampleSize: 64, maxDepth: 8, anomalyThreshold: 0.65 },
  light:         { numTrees: 1, sampleSize: 64, maxDepth: 8, anomalyThreshold: 0.7 },
  co2:           { numTrees: 1, sampleSize: 64, maxDepth: 8, anomalyThreshold: 0.65 },
}

/** 懒注册 IForest 检测器 */
function registerIForestLazy(sensor_id: number) {
  if (forests.has(sensor_id)) return
  const sensor = db.prepare(`SELECT id, metric FROM sensors WHERE id = ?`).get(sensor_id) as any
  if (!sensor) return
  const cfg = IFOREST_CONFIGS[sensor.metric] || DEFAULT_CONFIG
  const forest = new IsolationForest(cfg)
  // 用历史数据训练
  const rows = db.prepare(`
    SELECT value FROM sensor_data
    WHERE sensor_id = ? ORDER BY ts DESC LIMIT 256
  `).all(sensor_id) as Array<{ value: number }>
  if (rows.length >= 10) {
    forest.fit(rows.map(r => r.value))
    forests.set(sensor_id, { forest, metric: sensor.metric })
    console.log(`🌲  懒注册 IForest 传感器 ${sensor_id} (${sensor.metric})，训练样本 ${rows.length}`)
  }
}

/** 推入一个新数据点，返回 IForest 检测结果 */
export function detectIForest(sensor_id: number, value: number): IForestResult | null {
  registerIForestLazy(sensor_id)
  const entry = forests.get(sensor_id)
  if (!entry) return null
  return entry.forest.score(value)
}

/** 重新训练某传感器的 IForest（重置/演示用）*/
export function retrainIForest(sensor_id: number) {
  forests.delete(sensor_id)
  registerIForestLazy(sensor_id)
}

/** 全部 IForest 状态 */
export function listIForest() {
  const result: any[] = []
  for (const [sensor_id, { forest, metric }] of forests.entries()) {
    result.push({
      sensor_id,
      metric,
      trees: forest.state().trees,
    })
  }
  return result
}

// =============== 异常点持久化（与 Z-Score 共用 anomaly_records）==============
const recentIForestMap = new Map<string, number>()  // 10 分钟去重

export function recordIForestAnomaly(
  sensor_id: number,
  metric: string,
  value: number,
  result: IForestResult,
  ts: string
) {
  const key = `${sensor_id}:${metric}:iforest`
  const lastTs = recentIForestMap.get(key) || 0
  if (Date.now() - lastTs < 10 * 60 * 1000) return
  recentIForestMap.set(key, Date.now())

  const r = db.prepare(`
    INSERT INTO anomaly_records
      (sensor_id, metric, value, z_score, window_mean, window_std, window_size, severity, method, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'iforest', ?)
  `).run(
    sensor_id, metric, value,
    Number(result.score.toFixed(3)),  // 用 score 字段存 IForest 分数
    0, 0, result.pathLength,
    result.severity,
    ts
  )

  const record = {
    id: r.lastInsertRowid,
    sensor_id, metric, value,
    iforest_score: Number(result.score.toFixed(3)),
    path_length: Number(result.pathLength.toFixed(2)),
    severity: result.severity,
    method: 'iforest',
    ts,
  }
  io.emit('iforest_anomaly', record)
  console.log(`🌲🚨 [IForest] ${metric} score=${result.score.toFixed(2)} value=${value.toFixed(2)} severity=${result.severity}`)
}