# AgriSense submission package builder
# ------------------------------------------------------------------
# WHY THIS FILE IS ASCII-ONLY:
#   Windows PowerShell 5.1 decodes a BOM-less .ps1 as ANSI. Non-ASCII
#   bytes in comments or string literals get mangled and break statement
#   parsing, which leaves variables like $OutDir unset.
#   => Keep every character in this file ASCII. The Chinese output
#      folder name is built from Unicode code points at runtime.
#
# WHAT IT DOES:
#   rebuilds the submission folder from the repository:
#     source zip + all design docs + page screenshots + dataset + README
#
# USAGE (from the repo root):
#   powershell -ExecutionPolicy Bypass -File .\docs\build-submission.ps1
#   powershell -ExecutionPolicy Bypass -File .\docs\build-submission.ps1 -OutDir 'D:\somewhere'
param(
    [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot  = Split-Path -Parent $scriptDir

# "AgriSense-<submission material>" built from code points to stay ASCII-only.
# U+63D0 U+4EA4 U+6750 U+6599
$materialDirName = 'AgriSense-' + [char]0x63D0 + [char]0x4EA4 + [char]0x6750 + [char]0x6599

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $parent = Split-Path -Parent $repoRoot
    $OutDir = Join-Path $parent $materialDirName
}

Write-Host ('repo root : ' + $repoRoot)
Write-Host ('output    : ' + $OutDir)

# ---------- 1. prepare folders ----------
foreach ($sub in @('docs', 'docs\screenshots', 'data')) {
    $p = Join-Path $OutDir $sub
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

# ---------- 2. design docs ----------
# Enumerated dynamically instead of hardcoded, so renamed docs are picked up
# and this script never has to embed non-ASCII file names.
$docsCopied = 0
foreach ($p in (Get-ChildItem -Path $scriptDir -File)) {
    if ($p.Extension -in @('.md', '.html')) {
        Copy-Item $p.FullName (Join-Path $OutDir 'docs') -Force
        $docsCopied++
        Write-Host ('  [doc] ' + $p.Name)
    }
}
Write-Host ("docs copied: {0}" -f $docsCopied)

# ---------- 3. page screenshots ----------
$shotDir = Join-Path $scriptDir 'screenshots'
$shots = 0
if (Test-Path $shotDir) {
    foreach ($p in (Get-ChildItem -Path $shotDir -Filter '*.png' -File)) {
        Copy-Item $p.FullName (Join-Path $OutDir 'docs\screenshots') -Force
        $shots++
    }
}
Write-Host ("screenshots copied: {0}" -f $shots)

# ---------- 4. dataset (contest requires sample data files) ----------
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

# ---------- 6. source zip ----------
$zipPath = Join-Path $OutDir 'agri-sense-source.zip'
# git archive writes the committed tree straight into the zip.
# It keeps UTF-8 file names intact, which a Copy-Item staging loop cannot do
# on Windows PowerShell 5.1 (native command output is decoded as ANSI).
git -C $repoRoot archive --format=zip --output=$zipPath HEAD
Write-Host ("source zip: {0} ({1} KB)" -f $zipPath, [math]::Round((Get-Item $zipPath).Length / 1KB, 1))

Write-Host ''
Write-Host '=== submission package ready ==='
