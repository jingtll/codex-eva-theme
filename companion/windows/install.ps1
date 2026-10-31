# Codex EVA companion installer (current user only).
#
# Copies nothing outside this repository; it registers a per-user Run entry that
# starts the companion from this checkout and records a receipt of everything it
# created so uninstall.ps1 can remove exactly that and nothing else.
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1 [-Install]
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1

param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -ge 7) {
  Write-Error '请使用 Windows PowerShell 5.1 运行安装脚本。'
  exit 2
}

$CompanionRoot = Split-Path -Parent $PSScriptRoot
$Entry = Join-Path $CompanionRoot 'src\main.mjs'
$DataDir = Join-Path $env:APPDATA 'CodexEva'
$ReceiptPath = Join-Path $DataDir 'install-receipt.json'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunName = 'CodexEvaCompanion'
# Tests redirect registration to a scratch key so they never touch the real
# startup entry; anything other than HKCU is rejected below.
if ($env:CODEX_EVA_RUN_KEY) { $RunKey = $env:CODEX_EVA_RUN_KEY }
if ($RunKey -notlike 'HKCU:\*') {
  Write-Error "拒绝使用非当前用户注册表路径：$RunKey"
  exit 6
}

function Find-Node {
  $candidates = @(
    (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
  return $candidates | Select-Object -First 1
}

function Read-Receipt {
  if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) { return $null }
  try { return Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

function ConvertTo-CommandLine([string]$Node, [string]$Script) {
  # Quote each path so spaces in the installation directory survive the Run key.
  return ('"{0}" "{1}"' -f $Node, $Script)
}

if (-not (Test-Path -LiteralPath $Entry -PathType Leaf)) {
  Write-Error "未找到伴随程序入口：$Entry"
  exit 3
}

$Node = Find-Node
if (-not $Node) {
  Write-Error '未找到 node.exe（需要 Node.js 22 或更高版本）。'
  exit 4
}

$Version = (& $Node --version) -replace '^v', ''
if ([version]($Version.Split('.')[0] + '.0') -lt [version]'22.0') {
  Write-Error "Node.js 版本过低：$Version（需要 22 或更高版本）。"
  exit 4
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$Existing = Read-Receipt
$ExistingValue = $null
if ($null -ne $Existing -and $null -ne $Existing.registry) { $ExistingValue = [string]$Existing.registry.command }

if ($Uninstall) {
  if ($null -eq $Existing) {
    Write-Output 'REG-OK: no receipt'
    exit 0
  }
  $CurrentValue = $null
  try { $CurrentValue = (Get-ItemProperty -Path $RunKey -Name $RunName -ErrorAction Stop).$RunName } catch { }

  if ($null -eq $CurrentValue) {
    Write-Output 'REG-OK: registry value already absent'
  } elseif ($CurrentValue -ne $ExistingValue) {
    # The user (or another tool) changed the entry: leave their value alone.
    Write-Output 'REG-OK: user value kept'
  } else {
    Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue
    Write-Output 'REG-OK: removed'
  }

  $SettingsPath = Join-Path $DataDir 'settings.json'
  if (Test-Path -LiteralPath $SettingsPath -PathType Leaf) {
    Remove-Item -LiteralPath $SettingsPath -Force
    Write-Output '已移除皮肤偏好设置。'
  }
  Remove-Item -LiteralPath $ReceiptPath -Force -ErrorAction SilentlyContinue
  if ((Get-ChildItem -LiteralPath $DataDir -Force | Measure-Object).Count -eq 0) {
    Remove-Item -LiteralPath $DataDir -Force -ErrorAction SilentlyContinue
  }
  Write-Output '卸载完成；Codex 会话、凭据与用户项目未被改动。'
  exit 0
}

$Command = ConvertTo-CommandLine $Node $Entry

if ($null -ne $Existing -and $null -ne $ExistingValue -and $ExistingValue -eq $Command) {
  Write-Output 'REG-OK: already up to date'
} else {
  if (-not (Test-Path -LiteralPath $RunKey)) {
    New-Item -Path (Split-Path -Parent $RunKey) -Name (Split-Path -Leaf $RunKey) -Force | Out-Null
  }
  if (-not (Test-Path -LiteralPath $RunKey)) {
    Write-Error "无法创建启动项容器：$RunKey"
    exit 5
  }
  Set-ItemProperty -Path $RunKey -Name $RunName -Value $Command
  Write-Output "REG-OK: command = $Command"
}

$Receipt = [ordered]@{
  version     = 1
  installedAt = (Get-Date).ToUniversalTime().ToString('o')
  companion   = $CompanionRoot
  node        = $Node
  registry    = [ordered]@{ hive = 'HKCU'; key = 'Software\Microsoft\Windows\CurrentVersion\Run'; name = $RunName; command = $Command }
}
# Windows PowerShell 5.1's "UTF8" writes a BOM; the companion parses the receipt
# with JSON.parse, which rejects one, so write BOM-free UTF-8 explicitly.
[System.IO.File]::WriteAllText($ReceiptPath, ($Receipt | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "安装收据：$ReceiptPath"
Write-Output '日常仍从原来的 Codex 图标启动；伴随程序会在托盘等待并自动接入。'
