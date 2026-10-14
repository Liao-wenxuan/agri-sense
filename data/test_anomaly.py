"""
AgriSense - 异常检测端到端验证脚本
用法：python test_anomaly.py <token>
"""
import sys
import random
import time
import requests
from datetime import datetime, timedelta, timezone

BASE = 'http://localhost:3000/api'
TOKEN = sys.argv[1] if len(sys.argv) > 1 else ''

def h():
    return {'Authorization': f'Bearer {TOKEN}'}

print('===== 阶段 1: 推 50 个正常温度点（24-28℃）=====')
for i in range(50):
    val = 26 + random.gauss(0, 0.8)
    ts = (datetime.now(timezone.utc) - timedelta(seconds=(50-i)*2)).isoformat()
    requests.post(f'{BASE}/sensor-data', json={'sensor_id': 1, 'value': round(val, 2), 'ts': ts})
print('  ✓ 50 个正常点已推入')

time.sleep(1)

print('\n===== 阶段 2: 推 3 个明显异常点（45℃）=====')
for i in range(3):
    val = 45.0 + random.random()
    ts = datetime.now(timezone.utc).isoformat()
    r = requests.post(f'{BASE}/sensor-data', json={'sensor_id': 1, 'value': round(val, 2), 'ts': ts})
    print(f'  异常点 {i+1}/3: HTTP {r.status_code}')
time.sleep(1)

print('\n===== 阶段 3: 查询 anomaly/recent =====')
r = requests.get(f'{BASE}/anomaly/recent?limit=5', headers=h())
data = r.json()
print(f'  查到 {len(data)} 条异常记录')
for d in data[:5]:
    print(f'    id={d["id"]} {d["metric"]}={d["value"]:.2f} z={d["z_score"]:.2f} ({d["severity"]})')

print('\n===== 阶段 4: 查询 anomaly/detectors =====')
r = requests.get(f'{BASE}/anomaly/detectors', headers=h())
for d in r.json():
    print(f'  sensor {d["sensor_id"]} ({d["metric"]}): window={d["window_size"]}/100')

print('\n===== 阶段 5: 查询 anomaly/sensor/1（窗口状态）=====')
r = requests.get(f'{BASE}/anomaly/sensor/1', headers=h())
s = r.json()
print(f'  metric={s["metric"]} window_size={s["window_size"]} cfg.zThreshold={s["cfg"]["zThreshold"]}')
print(f'  最近异常 {len(s["recent_anomalies"])} 条')

print('\n✅ 验证完成')