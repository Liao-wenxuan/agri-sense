# AgriSense dashboard re-shoot (longer virtual time + big screen)
# ------------------------------------------------------------------
# WHY: 03-dashboard.png had an empty real-time line chart because that chart
# reads Pinia's realtime store (rt.latestData), which is fed ONLY by Socket.io
# pushes. Chrome's --virtual-time-budget uses a pause-if-network-pending policy,
# so a longer budget gives the socket time to connect and receive pushes.
#
# This file is ASCII-only on purpose: PowerShell 5.1 decodes a BOM-less .ps1 as
# ANSI and mangles non-ASCII bytes, which can break statement parsing.
#
# Usage: powershell -ExecutionPolicy Bypass -File .\reshoot-dashboard.ps1
$ErrorActionPreference = 'Stop'

$base    = 'https://agri-sense-2026.onrender.com'
$out     = Split-Path -Parent $MyInvocation.MyCommand.Definition
$chrome  = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profile = Join-Path $env:TEMP 'ChromeProfile_AgriSense'

if (-not (Test-Path $chrome)) { throw ("Chrome not found: " + $chrome) }

function Shot {
    param([string]$Name, [string]$Path, [int]$WaitSec)

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
    if (-not $proc.WaitForExit(180 * 1000)) {
        try { $proc.Kill() } catch {}
    }

    if (Test-Path $file) {
        Write-Host ("saved: {0}  ({1} KB)" -f $Name, [math]::Round((Get-Item $file).Length / 1KB, 1))
    } else {
        Write-Host ("FAILED: {0}" -f $Name)
    }
}

Write-Host '=== re-shoot dashboard (60s virtual time) ==='
Shot '03-dashboard.png' '/dashboard' 60

Write-Host '=== shoot fullscreen big screen (45s virtual time) ==='
Shot '09-bigscreen.png' '/big' 45

Write-Host '=== done ==='