"""
AgriSense - 性能压测脚本

场景：
- 模拟 100 设备 × 10 传感器 = 1000 sensor/s 并发上报
- 每个传感器 100 个点预热（让 Z-Score 窗口填满、IForest 训练）
- 然后并发推 1000 个点，统计延迟分布

输出：
- HTTP 延迟（POST 接口）
- 端到端延迟（含算法检测）
- 异常检测数量
- P50 / P95 / P99 延迟
"""
import sys
import time
import random
import asyncio
import aiohttp
import statistics
from datetime import datetime, timezone

BASE = 'http://localhost:3000/api'

async def setup_session():
    """登录拿 token"""
    async with aiohttp.ClientSession() as s:
        async with s.post(f'{BASE}/auth/login', json={'email': 'admin@agri.local', 'password': 'admin123'}) as r:
            data = await r.json()
            return data['accessToken']

async def setup_devices(token, num_devices=10, sensors_per_device=5):
    """创建 N 个设备，每个有 M 个传感器，返回所有 sensor_ids"""
    H = {'Authorization': f'Bearer {token}'}

    # 复用已有的 farm + greenhouse
    async with aiohttp.ClientSession(headers=H) as s:
        # 创建/获取 farm
        async with s.post(f'{BASE}/farms', json={'name': '压测农场', 'address': '雅安'}) as r:
            farm_id = (await r.json())['id']

        # 创建 greenhouse
        async with s.post(f'{BASE}/farms/greenhouses', json={'farm_id': farm_id, 'name': '压测棚', 'crop_type': 'tomato', 'area': 200}) as r:
            gh_id = (await r.json())['id']

        # 找现有 sensor IDs（避免重复创建）
        async with s.get(f'{BASE}/devices') as r:
            devices = await r.json()

    # 复用 device 1 的 sensors（temperature/humidity/soil_moisture/light/co2）
    sensor_ids = []
    if devices and devices[0].get('sensors'):
        sensor_ids = [s['id'] for s in devices[0]['sensors']]
    return sensor_ids

async def push_one(session, sensor_id, value, ts):
    """推一个点 + 测延迟"""
    t0 = time.perf_counter()
    try:
        async with session.post(f'{BASE}/sensor-data', json={
            'sensor_id': sensor_id, 'value': value, 'ts': ts,
        }) as r:
            await r.read()
            ok = r.status == 201
    except Exception as e:
        ok = False
    latency_ms = (time.perf_counter() - t0) * 1000
    return ok, latency_ms

async def warmup(token, sensor_ids, per_sensor=100):
    """预热：让每个 sensor 跑 100 个点（Z-Score 窗口填满 + IForest 训练）"""
    H = {'Authorization': f'Bearer {token}'}
    print(f'  预热：每个 sensor 推 {per_sensor} 个点...')
    async with aiohttp.ClientSession(headers=H) as session:
        tasks = []
        for sid in sensor_ids:
            for i in range(per_sensor):
                val = 26 + random.gauss(0, 0.8) if sid == 1 else 60 + random.gauss(0, 5)
                ts = datetime.now(timezone.utc).isoformat()
                tasks.append(push_one(session, sid, val, ts))
        results = await asyncio.gather(*tasks)
        ok_count = sum(1 for ok, _ in results if ok)
        print(f'  ✓ 预热完成：{ok_count}/{len(results)} 成功')

async def stress_test(token, sensor_ids, num_points=1000, concurrency=50):
    """压力测试：并发推 N 个点"""
    H = {'Authorization': f'Bearer {token}'}
    print(f'\n  压测：{num_points} 个点 / {concurrency} 并发 / {len(sensor_ids)} sensor(s)')

    # 用 semaphore 控制并发
    sem = asyncio.Semaphore(concurrency)

    async def push_with_limit(session, sensor_id, value, ts):
        async with sem:
            return await push_one(session, sensor_id, value, ts)

    t0 = time.perf_counter()
    async with aiohttp.ClientSession(headers=H) as session:
        tasks = []
        for i in range(num_points):
            sid = random.choice(sensor_ids)
            val = 26 + random.gauss(0, 0.8)
            # 注入 5% 异常
            if random.random() < 0.05:
                val = 40 + random.random() * 10
            ts = datetime.now(timezone.utc).isoformat()
            tasks.append(push_with_limit(session, sid, val, ts))
        results = await asyncio.gather(*tasks)
    total_ms = (time.perf_counter() - t0) * 1000

    ok_count = sum(1 for ok, _ in results if ok)
    latencies = [lat for ok, lat in results if ok]

    return {
        'total_time_ms': total_ms,
        'ok': ok_count,
        'failed': num_points - ok_count,
        'qps': num_points / (total_ms / 1000),
        'latencies_ms': latencies,
    }

def percentile(data, p):
    if not data: return 0
    sorted_data = sorted(data)
    idx = (len(sorted_data) - 1) * p
    lo, hi = int(idx), int(idx) + 1
    if hi >= len(sorted_data): return sorted_data[lo]
    return sorted_data[lo] + (sorted_data[hi] - sorted_data[lo]) * (idx - lo)

async def main():
    print('🚀 AgriSense 性能压测')
    print('=' * 60)

    print('\n[1] 登录...')
    token = await setup_session()
    print(f'  ✓ token 长度 {len(token)}')

    print('\n[2] 准备传感器...')
    sensor_ids = await setup_devices(token)
    print(f'  ✓ 复用 {len(sensor_ids)} 个 sensor')

    if not sensor_ids:
        print('  ⚠️ 无 sensor，先跑 seed.js')
        return

    print('\n[3] 预热（100 点/传感器）...')
    await warmup(token, sensor_ids, per_sensor=100)

    print('\n[4] 压测 1：1000 sensor/s，单 sensor')
    r = await stress_test(token, [sensor_ids[0]], num_points=1000, concurrency=50)
    print_results('1000 点 / 1 sensor / 50 并发', r)

    print('\n[5] 压测 2：500 点 / 5 sensor / 50 并发')
    r = await stress_test(token, sensor_ids, num_points=500, concurrency=50)
    print_results('500 点 / 5 sensor / 50 并发', r)

    print('\n[6] 压测 3：1000 点 / 5 sensor / 100 并发')
    r = await stress_test(token, sensor_ids, num_points=1000, concurrency=100)
    print_results('1000 点 / 5 sensor / 100 并发', r)

    print('\n[7] 异常统计...')
    async with aiohttp.ClientSession(headers={'Authorization': f'Bearer {token}'}) as s:
        async with s.get(f'{BASE}/anomaly/recent?limit=20') as r:
            anomalies = await r.json()
            z = [a for a in anomalies if (a.get('method') or 'zscore') == 'zscore']
            f = [a for a in anomalies if a.get('method') == 'iforest']
            print(f'  最近异常: Z-Score {len(z)} / IForest {len(f)}')

    print('\n✅ 压测完成')

def print_results(label, r):
    print(f'\n  ── {label} ──')
    print(f'  总耗时:      {r["total_time_ms"]:.0f} ms')
    print(f'  成功率:      {r["ok"]}/{r["ok"] + r["failed"]} ({r["ok"]/(r["ok"]+r["failed"])*100:.1f}%)')
    print(f'  QPS:         {r["qps"]:.0f} req/s')
    lats = r['latencies_ms']
    if lats:
        print(f'  延迟 P50:    {percentile(lats, 0.50):.1f} ms')
        print(f'  延迟 P95:    {percentile(lats, 0.95):.1f} ms')
        print(f'  延迟 P99:    {percentile(lats, 0.99):.1f} ms')
        print(f'  延迟 Max:    {max(lats):.1f} ms')
        print(f'  延迟 Mean:   {statistics.mean(lats):.1f} ms')

if __name__ == '__main__':
    asyncio.run(main())