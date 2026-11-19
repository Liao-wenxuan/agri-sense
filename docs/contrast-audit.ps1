# AgriSense theme contrast audit (WCAG 2.1 relative luminance ratios)
# ------------------------------------------------------------------
# WHY THIS FILE IS ASCII-ONLY:
#   Windows PowerShell 5.1 decodes a BOM-less .ps1 as ANSI, and any
#   non-ASCII byte in a comment can break statement parsing and leave
#   variables ($PSScriptRoot etc.) unset. Keep every character ASCII.
#
# WHAT IT DOES:
#   1. reads the built web bundle  web/dist/assets/index-*.css
#   2. resolves every theme scope the app actually ships
#        page level : html.dark (EP defaults) <- html.dark[data-theme=dark]
#                     (project overrides) <- [data-theme=dark] (project tokens)
#                     <- [data-theme=dark] .el-table
#                   :root (EP defaults) <- :root,[data-theme=light]
#                     (project tokens) <- .el-table <- [data-theme=light]
#        component  : .el-tag.el-tag--TYPE / .el-button--TYPE
#                     <- the project palette overrides for that theme
#   3. resolves every var() chain
#   4. prints the WCAG contrast ratio of each real foreground/background pair
#
# USAGE:
#   cd web ; npm run build
#   powershell -ExecutionPolicy Bypass -File ..\docs\contrast-audit.ps1
#
# EXIT CODE:
#   0 = every project-owned pair meets its threshold
#   1 = at least one project-owned pair is below threshold
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
    if ($null -eq $m) { continue }
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

# find CSS rules whose full selector text equals the given text.
# mode: 'first' | 'last' | 'merge' (merge concatenates every matching rule body,
# because Element Plus splits e.g. .el-tag.el-tag--primary into two rules)
function Find-Rule([string]$text, [string]$selector, [string]$mode) {
  $bodies = @()
  foreach ($m in [regex]::Matches($text, '([^{}]*)\{([^{}]*)\}')) {
    if ($m.Groups[1].Value.Trim() -ne $selector) { continue }
    $bodies += $m.Groups[2].Value
  }
  if ($bodies.Count -eq 0) { return $null }
  if ($mode -eq 'first') { return $bodies[0] }
  if ($mode -eq 'last')  { return $bodies[-1] }
  return ($bodies -join ';')
}

# ---------------------------------------------------------------- scopes
$epRoot    = Get-Vars (Find-Rule $css ':root' 'first')
$epDark    = Get-Vars (Find-Rule $css 'html.dark' 'first')
$ourDark   = Get-Vars (Find-Rule $css 'html.dark[data-theme=dark]' 'merge')
$tokDark   = Get-Vars (Find-Rule $css '[data-theme=dark]' 'merge')
$tblDark   = Get-Vars (Find-Rule $css '[data-theme=dark] .el-table' 'merge')
$tokLight  = Get-Vars (Find-Rule $css ':root,[data-theme=light]' 'merge')
$lightExt  = Get-Vars (Find-Rule $css '[data-theme=light]' 'merge')
$tblLight  = Get-Vars (Find-Rule $css '.el-table' 'merge')

$darkMap  = Merge-Vars @($epRoot, $epDark, $ourDark, $tokDark, $tblDark)
$lightMap = Merge-Vars @($epRoot, $tokLight, $lightExt, $tblLight)

# ---------------------------------------------------------------- contexts
# kind=tag : fg --el-tag-text-color   bg --el-tag-bg-color
# kind=btn : fg --el-button-text-color bg --el-button-bg-color
$contexts = @(
  @{ key = 'tag-primary'; kind = 'tag'; type = 'primary' },
  @{ key = 'tag-info';    kind = 'tag'; type = 'info' },
  @{ key = 'tag-success'; kind = 'tag'; type = 'success' },
  @{ key = 'tag-warning'; kind = 'tag'; type = 'warning' },
  @{ key = 'tag-danger';  kind = 'tag'; type = 'danger' },
  @{ key = 'btn-primary'; kind = 'btn'; type = 'primary' },
  @{ key = 'btn-info';    kind = 'btn'; type = 'info' },
  @{ key = 'btn-success'; kind = 'btn'; type = 'success' },
  @{ key = 'btn-warning'; kind = 'btn'; type = 'warning' },
  @{ key = 'btn-danger';  kind = 'btn'; type = 'danger' }
)

function Get-ContextMap($base, [string]$theme, $ctx) {
  if ($ctx.kind -eq 'tag') {
    $epSel = '.el-tag.el-tag--' + $ctx.type
    $ep  = Find-Rule $css $epSel 'merge'
    $ovr = $null
    if ($theme -eq 'light') {
      $ovr = Find-Rule $css ('[data-theme=light] ' + $epSel) 'merge'
    }
    return Merge-Vars @($base, (Get-Vars $ep), (Get-Vars $ovr))
  }
  $epSel = '.el-button--' + $ctx.type
  $ep  = Find-Rule $css $epSel 'merge'
  $ovr = $null
  if ($theme -eq 'light') {
    $ovr = Find-Rule $css ('[data-theme=light] ' + $epSel + ':not(.is-text):not(.is-link):not(.is-plain)') 'merge'
  } else {
    $ovr = Find-Rule $css ('html.dark[data-theme=dark] ' + $epSel + ':not(.is-text):not(.is-link):not(.is-plain)') 'merge'
  }
  return Merge-Vars @($base, (Get-Vars $ep), (Get-Vars $ovr))
}

# ---------------------------------------------------------------- pairs
# ctx = '' means the page level scope
$pairs = @(
  @{ n = 'table row text';         ctx = '';            fg = '--el-text-color-regular';      bg = '--el-table-tr-bg-color';       min = 4.5 },
  @{ n = 'table row HOVER text';   ctx = '';            fg = '--el-text-color-regular';      bg = '--el-table-row-hover-bg-color'; min = 4.5 },
  @{ n = 'table header text';      ctx = '';            fg = '--el-table-header-text-color'; bg = '--el-table-header-bg-color';   min = 4.5 },
  @{ n = 'input placeholder';      ctx = '';            fg = '--el-text-color-placeholder';  bg = '--el-fill-color-blank';        min = 4.5 },
  @{ n = 'app label (text-3)';     ctx = '';            fg = '--text-3';                     bg = '--bg-card';                    min = 4.5 },
  @{ n = 'app unit/trend(text-4)'; ctx = '';            fg = '--text-4';                     bg = '--bg-card';                    min = 4.5 },
  @{ n = 'app value (text-1)';     ctx = '';            fg = '--text-1';                     bg = '--bg-card';                    min = 4.5 },
  @{ n = 'page text';              ctx = '';            fg = '--text-1';                     bg = '--bg-page';                    min = 4.5 },
  @{ n = 'tag primary text';       ctx = 'tag-primary'; fg = '--el-tag-text-color';          bg = '--el-tag-bg-color';            min = 4.5 },
  @{ n = 'tag info text';          ctx = 'tag-info';    fg = '--el-tag-text-color';          bg = '--el-tag-bg-color';            min = 4.5 },
  @{ n = 'tag success text';       ctx = 'tag-success'; fg = '--el-tag-text-color';          bg = '--el-tag-bg-color';            min = 4.5 },
  @{ n = 'tag warning text';       ctx = 'tag-warning'; fg = '--el-tag-text-color';          bg = '--el-tag-bg-color';            min = 4.5 },
  @{ n = 'tag danger text';        ctx = 'tag-danger';  fg = '--el-tag-text-color';          bg = '--el-tag-bg-color';            min = 4.5 },
  @{ n = 'button primary text';    ctx = 'btn-primary'; fg = '--el-button-text-color';       bg = '--el-button-bg-color';         min = 4.5 },
  @{ n = 'button info text';       ctx = 'btn-info';    fg = '--el-button-text-color';       bg = '--el-button-bg-color';         min = 4.5 },
  @{ n = 'button success text';    ctx = 'btn-success'; fg = '--el-button-text-color';       bg = '--el-button-bg-color';         min = 4.5 },
  @{ n = 'button warning text';    ctx = 'btn-warning'; fg = '--el-button-text-color';       bg = '--el-button-bg-color';         min = 4.5 },
  @{ n = 'button danger text';     ctx = 'btn-danger';  fg = '--el-button-text-color';       bg = '--el-button-bg-color';         min = 4.5 }
)

# pairs the project controls in each theme
$appOwned = @{
  dark  = @('table row text', 'table row HOVER text', 'table header text',
            'input placeholder', 'app label (text-3)', 'app unit/trend(text-4)',
            'app value (text-1)', 'page text',
            'button primary text', 'button info text', 'button success text',
            'button warning text', 'button danger text')
  light = @('input placeholder', 'app label (text-3)', 'app unit/trend(text-4)',
            'app value (text-1)', 'page text',
            'tag primary text', 'tag info text', 'tag success text',
            'tag warning text', 'tag danger text',
            'button primary text', 'button info text', 'button success text',
            'button warning text', 'button danger text')
}

$failed = 0
foreach ($theme in @('dark', 'light')) {
  $base = if ($theme -eq 'dark') { $darkMap } else { $lightMap }
  $ctxMaps = @{}
  foreach ($c in $contexts) { $ctxMaps[$c.key] = Get-ContextMap $base $theme $c }

  Write-Host ''
  Write-Host ('==================== THEME: ' + $theme + ' ====================')
  foreach ($p in $pairs) {
    $map = if ($p.ctx -eq '') { $base } else { $ctxMaps[$p.ctx] }
    $fg = Resolve-Var $map $p.fg @()
    $bg = Resolve-Var $map $p.bg @()
    $ratio = Get-Ratio $fg $bg
    $isApp = $appOwned[$theme] -contains $p.n
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
  Write-Host ('RESULT: ' + $failed + ' project-owned pair(s) below threshold')
  exit 1
}
Write-Host 'RESULT: all project-owned pairs meet their threshold'
exit 0
