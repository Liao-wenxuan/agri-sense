# AgriSense theme contrast audit (WCAG 2.1 relative luminance ratios)
# ------------------------------------------------------------------
# WHY THIS FILE IS ASCII-ONLY:
#   Windows PowerShell 5.1 decodes a BOM-less .ps1 as ANSI, and any
#   non-ASCII byte in a comment can break statement parsing and leave
#   variables ($PSScriptRoot etc.) unset. Keep every character ASCII.
#
# WHAT IT DOES:
#   1. reads the built web bundle  web/dist/assets/index-*.css
#   2. extracts the theme scopes actually shipped
#        dark  : html.dark (EP defaults) <- html.dark[data-theme=dark]
#                (project overrides) <- [data-theme=dark] (project tokens)
#                <- [data-theme=dark] .el-table (table vars)
#        light : :root (EP defaults) <- :root,[data-theme=light]
#                (project tokens) <- .el-table (table vars)
#   3. resolves every var() chain
#   4. prints the WCAG contrast ratio of each real foreground/background pair
#
# USAGE:
#   cd web ; npm run build
#   powershell -ExecutionPolicy Bypass -File ..\docs\contrast-audit.ps1
#
# EXIT CODE:
#   0 = every pair meets its threshold
#   1 = at least one pair is below threshold
$ErrorActionPreference = 'Stop'

$repo   = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$assets = Join-Path $repo 'web\dist\assets'

if (-not (Test-Path $assets)) { throw ("Built assets not found: " + $assets) }
$cssFile = Get-ChildItem -Path $assets -Filter 'index-*.css' |
           Sort-Object -Property Length -Descending |
           Select-Object -First 1
if (-not $cssFile) { throw 'No index-*.css found. Run "npm run build" in web first.' }
$css = Get-Content -Raw -Path $cssFile.FullName

# ---------------------------------------------------------------- helpers
function Get-Block([string]$text, [string]$pattern) {
  $m = [regex]::Match($text, $pattern)
  if (-not $m.Success) { return $null }
  $start = $m.Index + $m.Length
  $depth = 1
  $i = $start
  while ($i -lt $text.Length -and $depth -gt 0) {
    if ($text[$i] -eq '{') { $depth++ } elseif ($text[$i] -eq '}') { $depth-- }
    $i++
  }
  return $text.Substring($start, $i - $start - 1)
}

function Get-Vars([string]$block) {
  $map = @{}
  if (-not $block) { return $map }
  foreach ($m in [regex]::Matches($block, '(--[a-zA-Z0-9-]+)\s*:\s*([^;]+)')) {
    $map[$m.Groups[1].Value] = $m.Groups[2].Value.Trim()
  }
  return $map
}

function Merge-Vars($maps) {
  $out = @{}
  foreach ($m in $maps) {
    foreach ($k in $m.Keys) { $out[$k] = $m[$k] }
  }
  return $out
}

function Resolve-Var($map, [string]$name, [string[]]$seen) {
  if (-not $map.ContainsKey($name)) { return $null }
  $v = $map[$name]
  $m = [regex]::Match($v, 'var\(\s*(--[a-zA-Z0-9-]+)\s*\)')
  if ($m.Success) {
    if ($seen -contains $m.Groups[1].Value) { return $v }
    $seen2 = @($seen) + $m.Groups[1].Value
    return Resolve-Var $map $m.Groups[1].Value $seen2
  }
  return $v
}

function Get-Lum([string]$hex) {
  if (-not $hex) { return $null }
  $h = $hex.Trim()
  if (-not $h.StartsWith('#')) { return $null }
  $h = $h.Substring(1)
  if ($h.Length -eq 3) { $h = $h[0] + $h[0] + $h[1] + $h[1] + $h[2] + $h[2] }
  if ($h.Length -ne 6) { return $null }
  $r = [Convert]::ToInt32($h.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($h.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($h.Substring(4, 2), 16)
  $lf = {
    param($v)
    $s = $v / 255.0
    if ($s -le 0.03928) { return $s / 12.92 }
    return [Math]::Pow((($s + 0.055) / 1.055), 2.4)
  }
  return (0.2126 * (& $lf $r)) + (0.7152 * (& $lf $g)) + (0.0722 * (& $lf $b))
}

function Get-Ratio([string]$fg, [string]$bg) {
  $l1 = Get-Lum $fg
  $l2 = Get-Lum $bg
  if ($null -eq $l1 -or $null -eq $l2) { return $null }
  $hi = [Math]::Max($l1, $l2)
  $lo = [Math]::Min($l1, $l2)
  return [Math]::Round((($hi + 0.05) / ($lo + 0.05)), 2)
}

# ---------------------------------------------------------------- scopes
$epDark   = Get-Vars (Get-Block $css 'html\.dark\{')
$ourDark  = Get-Vars (Get-Block $css 'html\.dark\[data-theme=dark\]\{')
$tokDark  = Get-Vars (Get-Block $css '\[data-theme=dark\]\{')
$tblDark  = Get-Vars (Get-Block $css '\[data-theme=dark\]\s\.el-table\{')
$epLight  = Get-Vars (Get-Block $css ':root\{')
$tokLight = Get-Vars (Get-Block $css ':root,\[data-theme=light\]\{')
$tblLight = Get-Vars (Get-Block $css '(?<![\w\-\]])\.el-table\{')

# EP 暗色作用域只覆盖被改写的变量，其余继承 :root，所以 :root 是两套主题的公共底座
$darkMap  = Merge-Vars @($epLight, $epDark, $ourDark, $tokDark, $tblDark)
$lightMap = Merge-Vars @($epLight, $tokLight, $tblLight)

# ---------------------------------------------------------------- pairs
# owner = 'app' : foreground/background come from project tokens or from a
#                 project override, so the project owns the ratio and a miss
#                 is a regression.
# owner = 'ep'  : Element Plus ships these values itself (identical in both
#                 themes). Reported for information, not counted as a failure.
$pairs = @(
  @{ n = 'table row text';         fg = '--el-text-color-regular';      bg = '--el-table-tr-bg-color';       min = 4.5 },
  @{ n = 'table row HOVER text';   fg = '--el-text-color-regular';      bg = '--el-table-row-hover-bg-color'; min = 4.5 },
  @{ n = 'table header text';      fg = '--el-table-header-text-color'; bg = '--el-table-header-bg-color';   min = 4.5 },
  @{ n = 'tag primary text';       fg = '--el-color-primary';           bg = '--el-color-primary-light-9';   min = 4.5 },
  @{ n = 'tag info text';          fg = '--el-color-info';              bg = '--el-color-info-light-9';      min = 4.5 },
  @{ n = 'tag success text';       fg = '--el-color-success';           bg = '--el-color-success-light-9';   min = 4.5 },
  @{ n = 'button default text';    fg = '--el-text-color-regular';      bg = '--el-fill-color-blank';        min = 4.5 },
  @{ n = 'button primary text';    fg = '--el-color-white';             bg = '--el-color-primary';           min = 3.0 },
  @{ n = 'input placeholder';      fg = '--el-text-color-placeholder';  bg = '--el-fill-color-blank';        min = 4.5 },
  @{ n = 'app label (text-3)';     fg = '--text-3';                     bg = '--bg-card';                    min = 4.5 },
  @{ n = 'app unit/trend(text-4)'; fg = '--text-4';                     bg = '--bg-card';                    min = 4.5 },
  @{ n = 'app value (text-1)';     fg = '--text-1';                     bg = '--bg-card';                    min = 4.5 },
  @{ n = 'page text';              fg = '--text-1';                     bg = '--bg-page';                    min = 4.5 }
)

# which pairs the project controls in which theme
$appOwned = @{
  dark  = @('table row text', 'table row HOVER text', 'table header text',
            'input placeholder', 'app label (text-3)', 'app unit/trend(text-4)',
            'app value (text-1)', 'page text')
  light = @('app label (text-3)', 'app unit/trend(text-4)',
            'app value (text-1)', 'page text')
}

$failed = 0
foreach ($theme in @(@{ n = 'dark'; m = $darkMap }, @{ n = 'light'; m = $lightMap })) {
  $map = $theme.m
  Write-Host ''
  Write-Host ('==================== THEME: ' + $theme.n + ' ====================')
  foreach ($p in $pairs) {
    $fg = Resolve-Var $map $p.fg @()
    $bg = Resolve-Var $map $p.bg @()
    $ratio = Get-Ratio $fg $bg
    $isApp = $appOwned[$theme.n] -contains $p.n
    if ($null -eq $ratio) {
      if ($isApp) { $failed++ }
      Write-Host ('  n/a  ' + $p.n.PadRight(22) + ' fg=' + $p.fg + ' bg=' + $p.bg + ' (unresolved)')
      continue
    }
    $flag = 'PASS'
    if ($ratio -lt $p.min) {
      $flag = 'FAIL'
      if ($isApp) { $failed++ } else { $flag = 'EP  ' }
    }
    $tag = 'app'
    if (-not $isApp) { $tag = 'ep ' }
    Write-Host ('  ' + $flag.PadRight(5) + ' ' + $tag + ' ' + $p.n.PadRight(22) +
                ' fg=' + $fg.PadRight(9) + ' bg=' + $bg.PadRight(9) +
                ' ratio=' + ([string]$ratio).PadRight(6) + ' min=' + $p.min)
  }
}

# ---- guard: the dark scope must not inherit Element Plus light-theme fills ----
# EP table hover row background = var(--el-fill-color-light).
# Before the fix the dark scope never redefined it, so the hover row turned
# near-white (#f5f7fa) while the text stayed near-white -> invisible row.
$fillDark   = Resolve-Var $darkMap  '--el-fill-color-light' @()
$fillLegacy = Resolve-Var $lightMap '--el-fill-color-light' @()
$rowText    = Resolve-Var $darkMap  '--el-text-color-regular' @()
Write-Host ''
Write-Host '---- regression guard: dark hover row background ----'
Write-Host ('  dark --el-fill-color-light   = ' + $fillDark)
Write-Host ('  light --el-fill-color-light  = ' + $fillLegacy + '   (what the dark scope used to inherit)')
Write-Host ('  hover row text ratio now     = ' + (Get-Ratio $rowText $fillDark))
Write-Host ('  hover row text ratio before  = ' + (Get-Ratio $rowText $fillLegacy))
$guardLum = Get-Lum $fillDark
if ($null -ne $guardLum -and $guardLum -gt 0.05) {
  $failed++
  Write-Host '  FAIL  dark --el-fill-color-light is too bright (would paint a white hover row)'
} else {
  Write-Host '  PASS  dark --el-fill-color-light stays dark'
}

Write-Host ''
if ($failed -gt 0) {
  Write-Host ('RESULT: ' + $failed + ' pair(s) below threshold')
  exit 1
}
Write-Host 'RESULT: all pairs meet their threshold'
exit 0