# AgriSense page screenshot script (Chrome headless)
# ------------------------------------------------------------------
# WHY THIS FILE IS ASCII-ONLY:
#   Windows PowerShell 5.1 decodes a BOM-less .ps1 as ANSI, which mangles any
#   non-ASCII bytes in the source. A mangled comment line can break statement
#   parsing and leave variables ($PSScriptRoot etc.) unset.
#   => Keep every character in this file ASCII. No Chinese comments, no
#      non-ASCII paths. The output dir is derived from $PSScriptRoot at runtime.
#
# WHY NOT CDP:
#   Edge headless on this machine never opens --remote-debugging-port.
#   Chrome's single-shot --screenshot mode needs no port at all.
#
# LOGIN STATE:
#   LoginView has a built-in demo mode: /login?demo=auto signs in with the demo
#   account and stores the token in localStorage. We reuse one --user-data-dir
#   across runs so the session seeded by that first run persists for the rest.
#
# Usage: powershell -ExecutionPolicy Bypass -File .\run-chrome-screenshot.ps1
$ErrorActionPreference = 'Stop'

$base    = 'https://agri-sense-2026.onrender.com'
$out     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$chrome  = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profile = Join-Path $env:TEMP 'ChromeProfile_AgriSense'

Write-Host ("output dir : " + $out)
Write-Host ("profile    : " + $profile)

if (-not (Test-Path $chrome)) { throw ("Chrome not found: " + $chrome) }
if (-not (Test-Path $out)) {
    New-Item -ItemType Directory -Path $out -Force | Out-Null
}

# Fresh profile each run so the login seeding is deterministic
if (Test-Path $profile) {
    Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
}

function Shot {
    param([string]$Name, [string]$Path, [int]$WaitSec = 8)

    $file = Join-Path $out $Name
    if (Test-Path $file) { Remove-Item $file -Force -ErrorAction SilentlyContinue }

    $argList = @(
        '--headless=new'
        '--disable-gpu'
        '--no-sandbox'
        '--no-first-run'
        '--no-default-browser-check'
        '--hide-scrollbars'
        ('--virtual-time-budget=' + ($WaitSec * 1000))
        '--window-size=1920,1080'
        ('--user-data-dir=' + $profile)
        ('--screenshot=' + $file)
        ($base + $Path)
    )

    $proc = Start-Process -FilePath $chrome -ArgumentList $argList -PassThru -WindowStyle Hidden
    if (-not $proc.WaitForExit(120 * 1000)) {
        try { $proc.Kill() } catch {}
    }

    if (Test-Path $file) {
        $kb = [math]::Round((Get-Item $file).Length / 1KB, 1)
        Write-Host ("saved: {0}  ({1} KB)" -f $Name, $kb)
    } else {
        Write-Host ("FAILED: {0}" -f $Name)
    }
}

Write-Host '=== AgriSense screenshot run start ==='

# 1) login page (public route)
Shot '01-login.png' '/login' 8

# 2) demo auto-login -- this run seeds the shared profile's localStorage
Write-Host '--- seeding login session via ?demo=auto ---'
Shot '03-dashboard.png' '/login?demo=auto' 15

# 3) remaining pages reuse that session
Shot '02-register.png' '/register'  8
Shot '04-devices.png'   '/devices'   10
Shot '05-algorithm.png' '/algorithm' 10
Shot '06-history.png'   '/history'   10
Shot '07-alerts.png'    '/alerts'    10

Write-Host '=== done ==='
Get-ChildItem -Path $out -Filter '*.png' | ForEach-Object {
    Write-Host ("  {0}  {1} KB" -f $_.Name, [math]::Round($_.Length / 1KB, 1))
}