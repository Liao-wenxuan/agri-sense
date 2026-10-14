"""
AgriSense - IForest + Z-Score 协同验证
"""
import sys, random, time
import requests
from datetime import datetime, timedelta, timezone

BASE = 'http://localhost:3000/api'
TOKEN = sys.argv[1]
H = {'Authorization': f'Bearer {TOKEN}'}

print('===== 阶段 1: 推 100 个正常温度点（训练 IForest）=====')
for i in range(100):
    val = 26 + random.gauss(0, 0.8)
    ts = (datetime.now(timezone.utc) - timedelta(seconds=(100-i)*2)).isoformat()
    requests.post(f'{BASE}/sensor-data', json={'sensor_id': 1, 'value': round(val, 2), 'ts': ts})
print('  ✓ 100 点已推入')

print('\n===== 阶段 2: 推 5 个明显异常（45℃，Z-Score + IForest 都该抓到）=====')
for i in range(5):
    val = 45.0 + random.random() * 0.5
    ts = datetime.now(timezone.utc).isoformat()
    r = requests.post(f'{BASE}/sensor-data', json={'sensor_id': 1, 'value': round(val, 2), 'ts': ts})
    print(f'  {i+1}/5: HTTP {r.status_code}')
time.sleep(2)

print('\n===== 阶段 3: 推 5 个温和偏高（33℃，阈值规则会告警但 Z-Score 不该）=====')
for i in range(5):
    val = 33.0 + random.random() * 0.3
    ts = datetime.now(timezone.utc).isoformat()
    requests.post(f'{BASE}/sensor-data', json={'sensor_id': 1, 'value': round(val, 2), 'ts': ts})
time.sleep(1)

print('\n===== 阶段 4: 查询 anomaly/recent（带 method 过滤）=====')
r = requests.get(f'{BASE}/anomaly/recent?limit=20', headers=H)
all_records = r.json()
zscore_recs = [a for a in all_records if a.get('method') == 'zscore']
iforest_recs = [a for a in all_records if a.get('method') == 'iforest']
print(f'  共 {len(all_records)} 条异常')
print(f'    Z-Score: {len(zscore_recs)} 条')
print(f'    IForest: {len(iforest_recs)} 条')

if zscore_recs:
    print('\n  Z-Score 样例（前 3 条）:')
    for r in zscore_recs[:3]:
        print(f'    {r["metric"]}={r["value"]:.2f} z={r["z_score"]:.2f} ({r["severity"]})')

if iforest_recs:
    print('\n  IForest 样例（前 3 条）:')
    for r in iforest_recs[:3]:
        print(f'    {r["metric"]}={r["value"]:.2f} score={r["z_score"]:.2f} path={r["window_size"]:.2f} ({r["severity"]})')

print('\n===== 阶段 5: 查询 anomaly/iforest =====')
r = requests.get(f'{BASE}/anomaly/iforest', headers=H)
forest_list = r.json()
for f in forest_list:
    print(f'  sensor {f["sensor_id"]} ({f["metric"]}): trees={f["trees"]}')

print('\n===== 阶段 6: 查询 anomaly/stats（按 method 分组）=====')
r = requests.get(f'{BASE}/anomaly/stats', headers=H)
for s in r.json():
    print(f'  [{s["method"]}] {s["metric"]}: total={s["total"]} high={s["high_count"]} medium={s["medium_count"]}')

print('\n===== 阶段 7: 对比接口 /anomaly/compare =====')
r = requests.get(f'{BASE}/anomaly/compare?sensor_id=1', headers=H)
comp = r.json()
print(f'  sensor {comp["sensor_id"]}: Z-Score 异常 {comp["zscore_count"]} 条 / IForest 异常 {comp["iforest_count"]} 条')

print('\n✅ IForest + Z-Score 双链路验证完成')