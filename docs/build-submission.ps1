# AgriSense 提交材料打包脚本
# ------------------------------------------------------------------
# 一键从仓库重新生成「提交材料」文件夹：
#   源码 zip + 全部设计文档 + 页面截图 + 实验数据集 + 材料清单
#
# 用法（在仓库根目录执行）：
#   powershell -ExecutionPolicy Bypass -File .\docs\build-submission.ps1
#   powershell -ExecutionPolicy Bypass -File .\docs\build-submission.ps1 -OutDir 'D:\somewhere'
#
# 本文件全 ASCII：PowerShell 5.1 以ANSI 解码无 BOM 的 .ps1，
# 非 ASCII 字节会被破坏并导致路径变量为空。
#
# 注意：脚本用 $PSScriptRoot / $PSCommandPath 推导仓库根目录，
# 避免在脚本里硬编码任何中文绝对路径。
param(
    [string]$OutDir =''
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot  = Split-Path -Parent $scriptDir

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    # 默认输出到「仓库同级的 AgriSense-提交材料」目录
    $parent    = Split-Path -Parent $repoRoot
    $OutDir    = Join-Path $parent 'AgriSense-提交材料'
}

Write-Host ('repo root : ' + $repoRoot)
Write-Host ('output    : ' + $OutDir)

# ---------- 1. 准备目录 ----------
foreach ($sub in @('docs', 'docs\screenshots', 'data')) {
    $p = Join-Path $OutDir $sub
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

# ---------- 2. 设计文档 ----------
$docs = @(
    '01-需求文档.md',
    '02-技术架构.md',
    '03-算法设计报告.md',
    '04-比赛PPT大纲.md',
    '05-database-ER.md',
    '06-测试报告.md',
    '07-成果展示视频脚本.md',
    'dashboard-prototype.html'
)
$copied = 0
foreach ($f in $docs) {
    $srcFile = Join-Path $scriptDir $f
    if (Test-Path $srcFile) {
        Copy-Item $srcFile (Join-Path $OutDir 'docs') -Force
        $copied++
    } else {
        Write-Host ('  [skip] missing doc: ' + $f)
    }
}
Write-Host ("docs copied: {0}/{1}" -f $copied, $docs.Count)

# ---------- 3. 页面截图 ----------
$shotDir = Join-Path $scriptDir 'screenshots'
$shots = 0
if (Test-Path $shotDir) {
    foreach ($p in (Get-ChildItem -Path $shotDir -Filter '*.png' -File)) {
        Copy-Item $p.FullName (Join-Path $OutDir 'docs\screenshots') -Force
        $shots++
    }
}
Write-Host ("screenshots copied: {0}" -f $shots)

# ---------- 4. 实验数据集（比赛要求：需提供样本数据文件）----------
$dataDir = Join-Path $repoRoot 'data'
$dataFiles = 0
if (Test-Path $dataDir) {
    foreach ($p in (Get-ChildItem -Path $dataDir -File)) {
        if ($p.Extension -in @('.py', '.csv')) {
            Copy-Item $p.FullName (Join-Path $OutDir 'data') -Force
            $dataFiles++
        }
    }
}
Write-Host ("dataset files copied: {0}" -f $dataFiles)

# ---------- 5. README ----------
Copy-Item (Join-Path $repoRoot 'README.md') $OutDir -Force

# ---------- 6. 打包源码 zip ----------
$zipPath = Join-Path $OutDir 'agri-sense-source.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$staging = Join-Path $env:TEMP ('agri-sense-zip-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
git -C $repoRoot ls-files | ForEach-Object {
    $rel = $_
    $dstPath = Join-Path $staging $rel
    $dstDir = Split-Path -Parent $dstPath
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    $full = Join-Path $repoRoot $rel
    if (Test-Path $full) { Copy-Item $full $dstPath -Force }
}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force
Write-Host ("source zip: {0} ({1} KB)" -f $zipPath, [math]::Round((Get-Item $zipPath).Length / 1KB, 1))

Write-Host ''
Write-Host '=== submission package ready ==='