# AgriSense Edge headless 截图脚本 v3 (稳定版)
$ErrorActionPreference = 'Stop'
$base = 'https://agri-sense-2026.onrender.com'
$out = 'C:\Users\廖文轩\Desktop\11\22\agri-sense\docs\screenshots'
$dbgPort = 9222
$profileDir = 'C:\Temp\EdgeProfile_AgriSense'

if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir }

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$proc = Start-Process -FilePath $edge -ArgumentList @(
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + $dbgPort,
    '--user-data-dir=' + $profileDir,
    '--window-size=1920,1080',
    'about:blank'
) -PassThru -WindowStyle Hidden
Write-Host ('Edge started PID=' + $proc.Id)

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri ('http://localhost:' + $dbgPort + '/json/version') -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    throw 'Edge remote debug not ready'
}

$loginUrl = $base + '/login?demo=auto'
$newTabUrl = 'http://localhost:' + $dbgPort + '/json/new?' + $loginUrl
$newTab = Invoke-WebRequest -Uri $newTabUrl -UseBasicParsing -TimeoutSec 10
$wsUrl = ($newTab.Content | ConvertFrom-Json).webSocketDebuggerUrl
Write-Host ('WS URL: ' + $wsUrl)

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ws.ConnectAsync([System.Uri]::new($wsUrl), [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
Write-Host 'WS connected'

$script:cid = 0

function Send-CDP($method, $params) {
    $script:cid++
    $cmd = @{ id = $script:cid; method = $method }
    if ($params) { $cmd.params = $params }
    $json = $cmd | ConvertTo-Json -Depth 5 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    $buf = [byte[]]::new(4194304)
    while ($true) {
        $r = $ws.ReceiveAsync([System.ArraySegment[byte]]::new($buf), [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $resp = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        if ($r.EndOfMessage) {
            $o = $resp | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($o -and $o.id -eq $script:cid) { return $o }
        }
    }
}

function Nav($url) {
    Send-CDP 'Page.enable' @{} | Out-Null
    Send-CDP 'Page.navigate' @{ url = $url } | Out-Null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        $st = Send-CDP 'Runtime.evaluate' @{ expression = 'document.readyState'; returnByValue = $true }
        $val = $st.result.result.value
        if ($val -eq 'complete') { break }
    }
    Start-Sleep -Seconds 4
}

function Shot($name) {
    $r = Send-CDP 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $false }
    if ($r -and $r.result -and $r.result.data) {
        $bytes = [Convert]::FromBase64String($r.result.data)
        $path = Join-Path $out $name
        [System.IO.File]::WriteAllBytes($path, $bytes)
        $len = $bytes.Length
        Write-Host ('saved: ' + $path + ' (' + $len + ' bytes)')
    } else {
        Write-Host 'capture failed'
    }
}

Nav ($base + '/login')
Shot '01-login.png'

# 演示模式自动登录（LoginView 内置 ?demo=auto，用 demo 凭证登录并跳转 dashboard）
Nav ($base + '/login?demo=auto')
Shot '03-dashboard.png'

# 注册页是公开路由，退出登录后访问
Nav ($base + '/register')
Shot '02-register.png'

Nav ($base + '/devices')
Shot '04-devices.png'

Nav ($base + '/algorithm')
Shot '05-algorithm.png'

Nav ($base + '/history')
Shot '06-history.png'

Nav ($base + '/alerts')
Shot '07-alerts.png'

# 第 8 页：主题切换 —— 强制深色后回 dashboard
$expr = 'localStorage.setItem("theme", JSON.stringify({mode:"dark"}))'
Send-CDP 'Runtime.evaluate' @{ expression = $expr } | Out-Null
Nav ($base + '/dashboard')
Shot '08-dashboard-dark.png'

# 恢复浅色，避免污染后续演示
Send-CDP 'Runtime.evaluate' @{ expression = 'localStorage.setItem("theme", JSON.stringify({mode:"light"}))' } | Out-Null

$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Host 'DONE'