# AgriSense Edge headless 截图脚本
# 启动 Edge headless + remote-debug-port,用 PowerShell WebSocket 控制 8 个页面截图

$ErrorActionPreference = 'Stop'
$base = 'https://agri-sense-2026.onrender.com'
$out = 'C:\Users\廖文轩\Desktop\11\22\agri-sense\docs\screenshots'
$dbgPort = 9222
$profileDir = 'C:\Temp\EdgeProfile_AgriSense'

# 清理旧 profile
if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir }

# 启动 Edge headless
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$proc = Start-Process -FilePath $edge -ArgumentList @(
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + $dbgPort,
    '--user-data-dir=' + $profileDir,
    '--window-size=1920,1080',
    'about:blank'
) -PassThru -WindowStyle Hidden

Write-Host "Edge 启动, PID=$($proc.Id)"

# 等 Edge remote debug 启动
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$dbgPort/json/version" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Host "Edge remote debug 未就绪,退出"
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "Edge remote debug OK"

# 获取新 tab 的 wsUrl
function New-Tab($url) {
    $r = Invoke-WebRequest -Uri ("http://localhost:$dbgPort/json/new?`+ $url") -UseBasicParsing -TimeoutSec 10
    return ($r.Content | ConvertFrom-Json).webSocketDebuggerUrl
}

function Send-CDP($ws, $id, $method, $params) {
    $cmd = @{ id = $id; method = $method }
    if ($params) { $cmd.params = $params }
    $json = $cmd | ConvertTo-Json -Depth 5 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    $buf = [byte[]]::new(1048576)
    while ($true) {
        $r = $ws.ReceiveAsync([System.ArraySegment[byte]]::new($buf), [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $resp = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        $o = $resp | ConvertFrom-Json
        if ($o.id -eq $id) { return $o }
        if ($o.id -lt $id) { continue }   # 跳过 event 帧
        return $null
    }
}

function Capture-Page($ws, $idRef, $outFile) {
    $r = Send-CDP $ws $idRef 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $false }
    if ($r -and $r.result -and $r.result.data) {
        $bytes = [Convert]::FromBase64String($r.result.data)
        [System.IO.File]::WriteAllBytes($outFile, $bytes)
        Write-Host ("saved: $outFile (" + $bytes.Length + " bytes)")
    } else {
        Write-Host ("screenshot failed: $r")
    }
}

function Navigate($ws, $idRef, $url) {
    Send-CDP $ws $idRef 'Page.enable' @{} | Out-Null
    Send-CDP $ws $idRef 'Page.navigate' @{ url = $url } | Out-Null
    # 等 load 完
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        $st = Send-CDP $ws $idRef 'Runtime.evaluate' @{ expression = 'document.readyState'; returnByValue = $true }
        if ($st.result.result.value -eq 'complete') { break }
    }
    Start-Sleep -Seconds 3   # 让 chart 渲染
}

# 主流程
$wsUrl = New-Tab "$base/login?demo=auto"
$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ws.ConnectAsync([System.Uri]::new($wsUrl), [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
Write-Host "WS connected: $wsUrl"

$id = [ref] 1
function Id() { $script:counter++; return $script:counter }
$script:counter = 0

# 1. Dashboard (登录后默认)
Navigate $ws $id "$base/dashboard"   # navigate 后会自动跳到 login,但 session 已有 token 跳 dashboard
Start-Sleep -Seconds 5  # 留时间给 chart 实时数据填充
Capture-Page $ws $id "$out\02-dashboard.png"

# 2. 设备管理
Navigate $ws $id "$base/devices"
Start-Sleep -Seconds 2
Capture-Page $ws $id "$out\03-devices.png"

# 3. 算法对比
Navigate $ws $id "$base/algorithm"
Start-Sleep -Seconds 3
Capture-Page $ws $id "$out\04-algorithm.png"

# 4. 历史查询
Navigate $ws $id "$base/history"
Start-Sleep -Seconds 2
Capture-Page $ws $id "$out\05-history.png"

# 5. 告警中心
Navigate $ws $id "$base/alerts"
Start-Sleep -Seconds 2
Capture-Page $ws $id "$out\06-alerts.png"

# 6. 个人中心 / Profile
Navigate $ws $id "$base/profile"
Start-Sleep -Seconds 2
Capture-Page $ws $id "$out\07-profile.png"

# 7. 深色主题 dashboard
Send-CDP $ws $id 'Runtime.evaluate' @{ expression = "localStorage.setItem('theme', JSON.stringify({mode:'dark'}))" } | Out-Null
Navigate $ws $id "$base/dashboard"
Start-Sleep -Seconds 5
Capture-Page $ws $id "$out\08-dashboard-dark.png"

# 关闭
$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Host "完成"