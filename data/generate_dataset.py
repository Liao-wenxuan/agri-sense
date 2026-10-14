#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AgriSense 智慧农业环境监测 —— 合成温室数据集生成脚本
================================================================
比赛用途：赛题第 (2) 条要求「自定义数据集需说明数据生成规则与样本量，
提供样本数据文件」。本脚本即数据生成规则的完整可复现实现。

【生成规则】
  样本量： 4 bay × 30 天 × 144 点/天 = 17,280 行
           （144 点/天 = 24h ÷ 10min 采样间隔）
  采样间隔：10 分钟
  指标：   temperature / humidity / soil_moisture / light / co2
  时间范围：2026-09-01 00:00:00 ~ 2026-09-30 23:50:00

【物理模型】
  每个指标由「基线 + 日周期正弦 + 噪声」构成，其中 light 额外带日出日落包络。
  随机种子固定为 42，保证任何人重跑得到完全相同的数据（可复现性要求）。

【注入异常】
  在 temperature 指标上注入 169 条「温度尖峰」，偏移量 +12 ~ +17 ℃，
  持续 1~3 个采样点（10~30 分钟），模拟通风故障 / 遮阳被掀等突发异常。
  这些是"真阳性(ground truth)"，用于评估 Z-Score 与 IForest 的检出率。

【输出】
  data/synthetic_greenhouse_30days_4bays.csv
  data/ground_truth_anomalies.csv   ← 异常标签，便于直接算检出率

用法：python data/generate_dataset.py
"""

import csv
import math
import os
import random
from datetime import datetime, timedelta

# ============================== 配置 ==============================
SEED = 42                    # 固定随机种子 → 可复现
BAYS = ["bay_1", "bay_2", "bay_3", "bay_4"]
DAYS = 30
SAMPLE_INTERVAL_MIN = 10     # 分钟
START_DATE = datetime(2026, 9, 1, 0, 0, 0)

# 异常注入参数（与《算法设计报告》4.1 节一致）
N_INJECTED_ANOMALIES = 169    # 注入尖峰条数
SPIKE_MIN_OFFSET = 12.0      # 尖峰最小偏移 +12℃
SPIKE_MAX_OFFSET = 17.0      # 尖峰最大偏移 +17℃
SPIKE_MAX_LEN = 3            # 尖峰最多持续 3 个采样点

# 各指标的物理参数： (基线, 振幅, 噪声标准差, 单位)
METRICS = {
    "temperature":  (26.0, 6.0,   0.8, "C"),      # ℃
    "humidity":     (65.0, 12.0,  2.5, "%"),      # %
    "soil_moisture":(45.0, 3.0,   1.2, "%"),      # %
    "light":        (0.0,  1.0,   0.05, "lux"),   # 归一化 0~1，夜间为 0
    "co2":          (600.0, 120.0, 25.0, "ppm"),  # ppm
}

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_CSV = os.path.join(OUT_DIR, "synthetic_greenhouse_30days_4bays.csv")
OUT_GT = os.path.join(OUT_DIR, "ground_truth_anomalies.csv")

# 采样点总数：4 bay × 30 天 × 144 点/天 = 17,280
# CSV 行数 = 采样点数 × 指标数 = 17,280 × 5 = 86,400
TOTAL_TIMESTAMPS = len(BAYS) * DAYS * (24 * 60 // SAMPLE_INTERVAL_MIN)


# ============================== 生成函数 ==============================

def diurnal(hour_float, metric):
    """日周期分量：hour_float ∈ [0,24)，返回 [-1, 1] 区间的相对偏移系数"""
    phase = 2 * math.pi * (hour_float - 14.0) / 24.0   # 14:00 达到峰值
    wave = math.sin(phase)

    if metric == "light":
        # 光照有日出日落包络：06:00 日出、19:00 日落，中间是抛物线
        sunrise, sunset = 6.0, 19.0
        if hour_float < sunrise or hour_float > sunset:
            return 0.0                                   # 夜间恒为 0
        t = (hour_float - sunrise) / (sunset - sunrise)  # 0~1
        return math.sin(t * math.pi)                     # 0 → 1 → 0
    return wave


def build_anomaly_windows(rng):
    """
    预生成异常注入点：返回 {(bay, day_index, point_index): offset}
    每个异常持续 1~3 个采样点，后续点继承同一偏移（表现为一段高温平台）。
    """
    points_per_day = 24 * 60 // SAMPLE_INTERVAL_MIN
    spikes = {}
    truth = []

    # 先把 169 条异常尽量均匀铺到 4 个 bay，避免全部堆在同一个 bay
    per_bay = N_INJECTED_ANOMALIES // len(BAYS)
    remainder = N_INJECTED_ANOMALIES % len(BAYS)

    for bi, bay in enumerate(BAYS):
        count = per_bay + (1 if bi < remainder else 0)
        # 把 day 随机打乱后循环取用，让异常在 30 天里铺得自然且不超量
        day_cycle = [rng.randrange(DAYS) for _ in range(count)]

        for k in range(count):
            day = day_cycle[k]

            # 避开每天开头 2 个点和结尾 2 个点（窗口未满，不参与检测）
            point = rng.randint(2, points_per_day - 5)
            offset = round(rng.uniform(SPIKE_MIN_OFFSET, SPIKE_MAX_OFFSET), 2)
            length = rng.randint(1, SPIKE_MAX_LEN)

            for j in range(length):
                pi = point + j
                if pi >= points_per_day:
                    break
                spikes[(bay, day, pi)] = offset

            ts = START_DATE + timedelta(
                days=day, minutes=pi * SAMPLE_INTERVAL_MIN
            )
            truth.append({
                "bay": bay,
                "day_index": day,
                "point_index": point,
                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
                "metric": "temperature",
                "offset_c": offset,
                "duration_points": length,
            })

    return spikes, truth


def main():
    rng = random.Random(SEED)
    spikes, truth = build_anomaly_windows(rng)

    points_per_day = 24 * 60 // SAMPLE_INTERVAL_MIN
    header = ["bay", "ts", "metric", "unit", "value", "quality_flag", "is_injected_anomaly"]

    rows = []
    for bay in BAYS:
        for day in range(DAYS):
            for pi in range(points_per_day):
                ts = START_DATE + timedelta(days=day, minutes=pi * SAMPLE_INTERVAL_MIN)
                hour_float = pi * SAMPLE_INTERVAL_MIN / 60.0

                for metric, (base, amp, noise, unit) in METRICS.items():
                    wave = diurnal(hour_float, metric)
                    value = base + amp * wave + rng.gauss(0, noise)

                    flag = 1          # 1=正常
                    injected = 0

                    if metric == "temperature":
                        off = spikes.get((bay, day, pi))
                        if off is not None:
                            value += off
                            flag = 2      # 2=异常
                            injected = 1

                    # 物理量纲修正，避免不合理的负值
                    if metric == "light":
                        value = max(0.0, min(1.0, value))
                    if metric == "humidity":
                        value = max(20.0, min(98.0, value))
                    if metric == "soil_moisture":
                        value = max(10.0, min(90.0, value))
                    if metric == "co2":
                        value = max(350.0, value)

                    rows.append([
                        bay,
                        ts.strftime("%Y-%m-%d %H:%M:%S"),
                        metric,
                        unit,
                        round(value, 2),
                        flag,
                        injected,
                    ])

    # ---------- 写主数据集 ----------
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)

    # ---------- 写异常标签 ----------
    with open(OUT_GT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["bay", "day_index", "point_index", "timestamp",
                        "metric", "offset_c", "duration_points"],
        )
        w.writeheader()
        w.writerows(sorted(truth, key=lambda r: (r["bay"], r["day_index"], r["point_index"])))

    # ---------- 控制台摘要 ----------
    n_timestamps = len(BAYS) * DAYS * (24 * 60 // SAMPLE_INTERVAL_MIN)
    print("=" * 60)
    print("AgriSense 合成温室数据集生成完成")
    print("=" * 60)
    print(f"输出文件     : {OUT_CSV}")
    print(f"异常标签文件 : {OUT_GT}")
    print(f"采样点数     : {n_timestamps:,}  (4 bay × {DAYS} 天 × 144 点/天)")
    print(f"CSV 总行数   : {len(rows):,}  (采样点数 × {len(METRICS)} 个指标)")
    print(f"采样间隔     : {SAMPLE_INTERVAL_MIN} 分钟")
    print(f"时间范围     : {rows[0][1]} ~ {rows[-1][1]}")
    print(f"bay 数量     : {len(BAYS)}  ({', '.join(BAYS)})")
    print(f"指标数量     : {len(METRICS)}  ({', '.join(METRICS.keys())})")
    print(f"注入异常条数 : {len(truth)}  (temperature 尖峰 +{SPIKE_MIN_OFFSET}~+{SPIKE_MAX_OFFSET}C)")
    print(f"异常采样点数 : {sum(r[6] for r in rows)}  (rows 中 is_injected_anomaly=1 的行数)")
    print(f"随机种子     : {SEED}  (重跑结果完全一致)")
    print("=" * 60)


if __name__ == "__main__":
    main()