#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AgriSense —— 数据集分析与算法性能验证
================================================================
用途：《算法设计报告》第 4 章「实验数据与对比」+ 第 5 章「性能验证」的可复现计算。

本脚本**不是**把报告里的数字抄一遍，而是：
  1. 读取 data/synthetic_greenhouse_30days_4bays.csv（真实数据文件）
  2. 读取 data/ground_truth_anomalies.csv（注入异常的 ground truth）
  3. 用与线上服务**完全相同**的算法参数跑一遍
     （TS 版见 server/src/services/anomaly.ts: METRIC_CONFIGS）
  4. 算出真实的检出率 / 误报率 / 响应延迟

因此报告里的每个数字都可以用 `python data/analyze.py` 现场复算。

【三组被测算法】
  A. 阈值规则   : temperature > 32℃                    （业务硬边界）
  B. Z-Score    : 滑动窗口 100，|z| > 2.5，minWindow 20（移植 anomaly.ts）
  C. 说明       : IForest 为 TS 实现，Python 侧不做复现，避免两套实现对不上；
                  其线上行为见 docs/03-算法设计报告.md §4.3 场景对比。

【检出率定义】
  一条「注入异常」由若干连续采样点组成。只要该异常的窗口内**有任意一个点被检出**，
  就算这条异常被检出（符合告警系统的实际语义：运维只需知道"这里出了问题"）。

用法：python data/analyze.py
"""

import csv
import os
import time
from collections import defaultdict

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(OUT_DIR, "synthetic_greenhouse_30days_4bays.csv")
GT_PATH = os.path.join(OUT_DIR, "ground_truth_anomalies.csv")

# ---- 与 server/src/services/anomaly.ts 的 METRIC_CONFIGS 保持一致 ----
METRIC_CONFIGS = {
    "temperature":   {"windowSize": 100, "zThreshold": 2.5, "minWindow": 20},
    "humidity":      {"windowSize": 100, "zThreshold": 3.0, "minWindow": 20},
    "soil_moisture": {"windowSize": 100, "zThreshold": 3.0, "minWindow": 20},
    "light":         {"windowSize": 80,  "zThreshold": 4.0, "minWindow": 15},
    "co2":           {"windowSize": 100, "zThreshold": 2.5, "minWindow": 20},
}

TEMP_THRESHOLD_RULE = 32.0     # 阈值规则：温度 > 32℃
BAYS = ["bay_1", "bay_2", "bay_3", "bay_4"]


class ZScoreDetector:
    """ZScoreDetector 的 Python 移植版，逻辑逐行对齐 server/src/services/anomaly.ts

    构造函数直接接受 TS 侧 METRIC_CONFIGS 的字段名(windowSize/zThreshold/minWindow)，
    这样 Python 与线上 TypeScript 用的是同一份参数字典，不存在两处配置漂移。
    """

    def __init__(self, windowSize=100, zThreshold=2.5, minWindow=20):
        self.window = []
        self.sum = 0.0
        self.sum_sq = 0.0
        self.cfg = {"windowSize": windowSize,
                    "zThreshold": zThreshold,
                    "minWindow": minWindow}

    def push(self, value):
        if len(self.window) >= self.cfg["windowSize"]:
            old = self.window.pop(0)
            self.sum -= old
            self.sum_sq -= old * old
        self.window.append(value)
        self.sum += value
        self.sum_sq += value * value

        if len(self.window) < self.cfg["minWindow"]:
            return False, 0.0

        n = len(self.window)
        mean = self.sum / n
        variance = (self.sum_sq / n) - mean * mean
        std = variance ** 0.5 if variance > 0 else 0.0
        z = 0.0 if std == 0 else (value - mean) / std
        return abs(z) > self.cfg["zThreshold"], z


# ============================== 读取数据 ==============================

def load_series():
    """读 CSV，返回 series[bay][metric] = [(ts, value, injected_bool), ...]"""
    series = defaultdict(lambda: defaultdict(list))
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            series[row["bay"]][row["metric"]].append(
                (row["ts"], float(row["value"]), row["is_injected_anomaly"] == "1")
            )
    for bay in series:
        for metric in series[bay]:
            series[bay][metric].sort(key=lambda r: r[0])
    return series


def load_ground_truth():
    """读 ground truth，返回按 (bay, day, point) 索引的异常集合"""
    gt = set()
    rows = []
    with open(GT_PATH, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            key = (row["bay"], int(row["day_index"]), int(row["point_index"]))
            gt.add(key)
            rows.append(row)
    return gt, rows


# ============================== 评估 ==============================

def eval_temperature(series, ground_truth):
    """
    对 temperature 指标分别跑阈值规则与 Z-Score，统计：
      - 检出：注入的异常点中，有多少被算法标记
      - 误报：未被注入异常的点中，有多少被算法标记
      - 延迟：从异常开始到首次告警的采样点数
    """
    results = {}
    for algo in ("rule", "zscore"):
        detected_points = defaultdict(set)   # bay -> set(被检出点的绝对索引)
        t0 = time.perf_counter()
        total_points = 0

        for bay in BAYS:
            pts = series[bay]["temperature"]
            det = ZScoreDetector(**METRIC_CONFIGS["temperature"])
            for idx, (_ts, value, _inj) in enumerate(pts):
                total_points += 1
                if algo == "rule":
                    hit = value > TEMP_THRESHOLD_RULE
                else:
                    hit, _z = det.push(value)
                if hit:
                    detected_points.setdefault(bay, set()).add(idx)

        elapsed_ms = (time.perf_counter() - t0) * 1000

        # --- 与 ground truth 对齐 ---
        # ground truth 用 (bay, day, point) 定位，转换成该 bay 序列中的绝对索引
        tp_points = 0
        fp_points = 0
        anomaly_idx_by_bay = defaultdict(set)

        for bay in BAYS:
            idx = 0
            for day in range(30):
                for p in range(144):
                    if (bay, day, p) in ground_truth:
                        anomaly_idx_by_bay[bay].add(idx)
                    idx += 1

            det = detected_points.get(bay, set())
            for i in det:
                if i in anomaly_idx_by_bay[bay]:
                    tp_points += 1
                else:
                    fp_points += 1

        # --- 按「一条异常」统计检出（任意点命中即算检出）---
        gt_rows = [r for r in csv.DictReader(open(GT_PATH, encoding="utf-8"))
                   if r["metric"] == "temperature"]
        hit_anomalies = 0
        for r in gt_rows:
            bay = r["bay"]
            day, p = int(r["day_index"]), int(r["point_index"])
            base = day * 144
            length = int(r["duration_points"])
            det = detected_points.get(bay, set())
            if any((base + p + j) in det for j in range(length)):
                hit_anomalies += 1

        n_gt = len(gt_rows)
        n_injected_points = sum(len(v) for v in anomaly_idx_by_bay.values())
        n_normal = total_points - n_injected_points

        results[algo] = {
            "hit_anomalies": hit_anomalies,
            "n_gt": n_gt,
            "detect_rate": hit_anomalies / n_gt * 100 if n_gt else 0.0,
            "tp_points": tp_points,
            "fp_points": fp_points,
            "fp_rate": fp_points / n_normal * 100 if n_normal else 0.0,
            "elapsed_ms": elapsed_ms,
            "per_point_us": elapsed_ms * 1000 / total_points if total_points else 0.0,
        }
    return results


def summarize_dataset(series):
    """打印数据集概览 + 各指标分位数（报告 §2.2 阈值设定的依据）"""
    print("=" * 74)
    print("一、数据集概览")
    print("=" * 74)
    total_pts = sum(len(series[b]["temperature"]) for b in BAYS)
    print(f"  bay 数量      : {len(BAYS)}  ({', '.join(BAYS)})")
    print(f"  采样点数/天   : 144  (10 分钟 × 144)")
    print(f"  总采样点      : {total_pts:,}")
    print(f"  指标数        : 5")
    print(f"  CSV 总行数    : {total_pts * 5:,}   (采样点 × 5 指标)")
    print()

    print("  各指标分位数（用于确定 Z-Score 阈值）:")
    print(f"  {'指标':<16}{'min':>10}{'p50':>10}{'p95':>10}{'p99':>10}{'max':>10}")
    print("  " + "-" * 66)
    for metric in ("temperature", "humidity", "soil_moisture", "light", "co2"):
        vals = sorted(v for bay in BAYS for (_t, v, _i) in series[bay][metric])
        n = len(vals)

        def q(p):
            return vals[min(n - 1, int(n * p))]

        print(f"  {metric:<16}{q(0.0):>10.2f}{q(0.5):>10.2f}"
              f"{q(0.95):>10.2f}{q(0.99):>10.2f}{vals[-1]:>10.2f}")
    print()


def sweep_window(series, ground_truth):
    """窗口长度敏感性分析：Z-Score 的窗口决定了"基线"的尺度。

    窗口太长(如 100 点 ≈ 16.7h)会把昼夜周期一起算进均值/标准差，
    基线被日周期撑大，短时温度尖峰反而被淹没；
    窗口太短(如 12 点 = 2h)则基线不稳，夜间升温会被误判。
    这里扫一遍窗口长度，给出检测率与误报率的权衡曲线。
    """
    print("=" * 74)
    print("四、Z-Score 窗口长度敏感性分析（参数调优依据）")
    print("=" * 74)
    print(f"  {'窗口':>6}{'时长':>10}{'检出率':>10}{'误报率':>10}   说明")
    print("  " + "-" * 66)

    anomaly_idx_by_bay = defaultdict(set)
    for bay in BAYS:
        idx = 0
        for day in range(30):
            for p in range(144):
                if (bay, day, p) in ground_truth:
                    anomaly_idx_by_bay[bay].add(idx)
                idx += 1

    gt_rows = [r for r in csv.DictReader(open(GT_PATH, encoding="utf-8"))
               if r["metric"] == "temperature"]

    best = None
    for w in (12, 24, 36, 48, 72, 100, 144):
        hit_anomalies = 0
        fp_points = 0
        n_normal_total = 0

        for bay in BAYS:
            pts = series[bay]["temperature"]
            det = ZScoreDetector(windowSize=w, zThreshold=2.5, minWindow=max(10, w // 5))
            det_set = set()
            for idx, (_ts, value, _inj) in enumerate(pts):
                hit, _z = det.push(value)
                if hit:
                    det_set.add(idx)
            for i in det_set:
                if i not in anomaly_idx_by_bay[bay]:
                    fp_points += 1
            n_normal_total += len(pts) - len(anomaly_idx_by_bay[bay])

            # 只统计属于当前 bay 的 ground truth 行；4 个 bay 合起来正好 169 条，
            # 因此 hit_anomalies 不需要再除以 bay 数（曾经误除导致检出率只有 1/4）。
            for r in gt_rows:
                if r["bay"] != bay:
                    continue
                day, p = int(r["day_index"]), int(r["point_index"])
                base = day * 144
                length = int(r["duration_points"])
                if any((base + p + j) in det_set for j in range(length)):
                    hit_anomalies += 1

        n_gt = len(gt_rows)
        dr = hit_anomalies / n_gt * 100 if n_gt else 0
        fpr = fp_points / n_normal_total * 100 if n_normal_total else 0
        hours = w * 10 / 60
        note = ""
        if w == 100:
            note = "← 当前线上配置(昼夜混入基线)"
        # Youden's J = 检出率 - 误报率，越大越好
        score = dr - fpr
        if best is None or score > best[3]:
            best = (w, dr, fpr, score)
        print(f"  {w:>6}{hours:>9.1f}h{dr:>9.1f}%{fpr:>9.1f}%   {note}")

    print()
    print(f"  推荐窗口 : {best[0]} 点（约 {best[0] * 10 / 60:.1f}h）"
          f"，检出 {best[1]:.1f}% / 误报 {best[2]:.1f}%  (Youden J={best[3]:.1f})")
    print("=" * 74)


def main():
    if not os.path.exists(CSV_PATH):
        print(f"[错误] 找不到数据集 {CSV_PATH}")
        print("请先运行：python data/generate_dataset.py")
        return

    series = load_series()
    ground_truth, gt_rows = load_ground_truth()

    summarize_dataset(series)

    print("=" * 74)
    print("二、注入异常（ground truth）")
    print("=" * 74)
    n_inj_pts = sum(1 for bay in BAYS for (_t, _v, inj) in series[bay]["temperature"] if inj)
    print(f"  异常条数      : {len(gt_rows)}   (temperature 尖峰 +12~+17℃)")
    print(f"  异常采样点数  : {n_inj_pts}   (每条持续 1~3 个采样点)")
    print(f"  正常采样点数  : {len(BAYS) * 4320 - n_inj_pts:,}")
    print()

    print("=" * 74)
    print("三、算法性能验证（真实计算，非引用报告数字）")
    print("=" * 74)
    res = eval_temperature(series, ground_truth)

    print(f"  {'算法':<24}{'检出':>10}{'检出率':>10}{'误报点':>10}{'误报率':>10}")
    print("  " + "-" * 64)
    rule = res["rule"]
    print(f"  {'阈值规则 (T>32C)':<22}{rule['hit_anomalies']:>4}/{rule['n_gt']:<5}"
          f"{rule['detect_rate']:>9.1f}%{rule['fp_points']:>10}"
          f"{rule['fp_rate']:>9.1f}%")
    z = res["zscore"]
    print(f"  {'Z-Score (|z|>2.5)':<21}{z['hit_anomalies']:>4}/{z['n_gt']:<5}"
          f"{z['detect_rate']:>9.1f}%{z['fp_points']:>10}"
          f"{z['fp_rate']:>9.1f}%")
    print()
    print(f"  Z-Score 全量扫描耗时  : {z['elapsed_ms']:.1f} ms  "
          f"(17,280 点, 即 {z['per_point_us']:.2f} μs/点)")
    print()
    print("  说明：IForest 为 TypeScript 实现 (server/src/services/isolationForest.ts)，")
    print("        Python 侧不复现以避免双实现不一致；其优势场景见报告 §4.3。")
    print("=" * 74)
    print()

    sweep_window(series, ground_truth)


if __name__ == "__main__":
    main()