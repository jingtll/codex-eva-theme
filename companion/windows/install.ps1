# Codex EVA companion installer (current user only).
#
# Copies nothing outside this repository; it registers a per-user Run entry that
# starts the companion from this checkout and records a receipt of everything it
# created so uninstall.ps1 can remove exactly that and nothing else.
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1

param(
  [switch]$Uninstall,
  [switch]$CreateShortcut,
  [string]$ShortcutDirectory,
  [switch]$StartCompanion
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'receipt.ps1')

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
. (Join-Path $PSScriptRoot 'desktop-context.ps1')
# Scratch-key tests cannot alter real login registration. Production writes
# must happen outside the Store app's virtual registry/data views.
if (-not $env:CODEX_EVA_RUN_KEY -and (Get-EvaPackageCode) -ne 15700) {
  throw 'NATIVE_DESKTOP_REQUIRED: 请改用 desktop.ps1 -Action Install（卸载用 Uninstall）。'
}
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
  return Read-EvaReceipt $ReceiptPath
}

function Write-ReceiptAtomically($Value) {
  Write-EvaReceipt $ReceiptPath $Value
}

$Existing = Read-Receipt
$ExistingValue = $null
if ($null -ne $Existing -and $null -ne $Existing.registry) { $ExistingValue = [string]$Existing.registry.command }

if ($Uninstall) {
  if ($null -eq $Existing) {
    & (Join-Path $PSScriptRoot 'shortcut.ps1') -Remove
    Write-Output 'REG-OK: no receipt'
    exit 0
  }
  $LockPath = Join-Path $DataDir 'settings.json.lock'
  if (Test-Path -LiteralPath $LockPath -PathType Leaf) {
    $OwnerId = 0
    $LockStream = [IO.File]::Open($LockPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $LockReader = New-Object IO.StreamReader($LockStream)
    try { [void][int]::TryParse($LockReader.ReadToEnd(), [ref]$OwnerId) } finally { $LockReader.Dispose() }
    if ($OwnerId -gt 0 -and (Get-Process -Id $OwnerId -ErrorAction SilentlyContinue)) {
      [IO.File]::WriteAllText((Join-Path $DataDir 'settings.json.stop'), 'quit')
      for ($Attempt = 0; $Attempt -lt 100 -and (Test-Path -LiteralPath $LockPath); $Attempt++) { Start-Sleep -Milliseconds 100 }
      if (Test-Path -LiteralPath $LockPath) { throw 'COMPANION_STOP_TIMEOUT: 伴随程序未退出，已保留安装内容。' }
    } else { Remove-Item -LiteralPath $LockPath -Force }
  }
  $CurrentValue = $null
  try { $CurrentValue = (Get-ItemProperty -Path $RunKey -Name $RunName -ErrorAction Stop).$RunName } catch { }

  if ($null -eq $CurrentValue) {
    Write-Output 'REG-OK: registry value already absent'
  } elseif ($CurrentValue -ne $ExistingValue -and -not ($Existing.phase -eq 'prepared' -and $CurrentValue -eq $Existing.registry.beforeValue)) {
    # The user (or another tool) changed the entry: leave their value alone.
    Write-Output 'REG-OK: user value kept'
  } else {
    if ($null -ne $Existing.registry.previousValue) {
      Set-ItemProperty -Path $RunKey -Name $RunName -Value ([string]$Existing.registry.previousValue)
      Write-Output 'REG-OK: previous value restored'
    } else {
      Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction Stop
      Write-Output 'REG-OK: removed'
    }
  }

  & (Join-Path $PSScriptRoot 'shortcut.ps1') -Remove
  $SettingsPath = Join-Path $DataDir 'settings.json'
  if (Test-Path -LiteralPath $SettingsPath -PathType Leaf) {
    Remove-Item -LiteralPath $SettingsPath -Force
    Write-Output '已移除皮肤偏好设置。'
  }
  Remove-Item -LiteralPath $ReceiptPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath ($ReceiptPath + '.recovery') -Force -ErrorAction SilentlyContinue
  if ((Get-ChildItem -LiteralPath $DataDir -Force | Measure-Object).Count -eq 0) {
    Remove-Item -LiteralPath $DataDir -Force -ErrorAction SilentlyContinue
  }
  Write-Output '卸载完成；Codex 会话、凭据与用户项目未被改动。'
  exit 0
}

if (-not (Test-Path -LiteralPath $Entry -PathType Leaf)) { throw '未找到伴随程序入口。' }
$Node = Find-Node
if (-not $Node) { throw '未找到 Node.js 22 或更高版本。' }
$Version = (& $Node --version) -replace '^v', ''
if ([int]$Version.Split('.')[0] -lt 22) { throw '需要 Node.js 22 或更高版本。' }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
# Keep the startup command transparent: no shell or execution-policy override.
# node.exe may show a console; closing it stops the companion.
$Command = '"{0}" "{1}"' -f $Node, $Entry
$CurrentValue = $null
try { $CurrentValue = (Get-ItemProperty -Path $RunKey -Name $RunName -ErrorAction Stop).$RunName } catch { }
$PreviousValue = $CurrentValue
if ($null -ne $Existing) {
  if ($null -ne $CurrentValue -and $CurrentValue -ne $ExistingValue -and -not ($Existing.phase -eq 'prepared' -and $CurrentValue -eq $Existing.registry.beforeValue)) { throw 'REGISTRY_CONFLICT: 启动项已被修改，拒绝覆盖。' }
  $PreviousValue = $Existing.registry.previousValue
}

if ($CurrentValue -ne $Command) {
  if (-not (Test-Path -LiteralPath $RunKey)) {
    New-Item -Path (Split-Path -Parent $RunKey) -Name (Split-Path -Leaf $RunKey) -Force | Out-Null
  }
  if (-not (Test-Path -LiteralPath $RunKey)) {
    Write-Error "无法创建启动项容器：$RunKey"
    exit 5
  }
}

$Receipt = [ordered]@{
  version     = 1
  phase       = 'prepared'
  installedAt = (Get-Date).ToUniversalTime().ToString('o')
  companion   = $CompanionRoot
  node        = $Node
  registry    = [ordered]@{ hive = 'HKCU'; key = 'Software\Microsoft\Windows\CurrentVersion\Run'; name = $RunName; command = $Command; beforeValue = $CurrentValue; previousValue = $PreviousValue }
}
# The prepared receipt preserves both sides of an interrupted registry update.
Write-ReceiptAtomically $Receipt
$ShortcutReceiptPath = Join-Path $DataDir 'shortcut-receipt.json'
$ShortcutIconPath = Join-Path $DataDir 'shortcut-codex.ico'
$PriorShortcutReceipt = $null
$PriorShortcutIcon = $null
if ($CreateShortcut) {
  if (Test-Path -LiteralPath $ShortcutReceiptPath -PathType Leaf) { $PriorShortcutReceipt = [IO.File]::ReadAllBytes($ShortcutReceiptPath) }
  if (Test-Path -LiteralPath $ShortcutIconPath -PathType Leaf) { $PriorShortcutIcon = [IO.File]::ReadAllBytes($ShortcutIconPath) }
}
$CreatedShortcut = $false
try {
  if ($CurrentValue -eq $Command) { Write-Output 'REG-OK: already up to date' }
  else {
    Set-ItemProperty -Path $RunKey -Name $RunName -Value $Command -ErrorAction Stop
    Write-Output "REG-OK: command = $Command"
  }
  if ($CreateShortcut) {
    if ($ShortcutDirectory) { $ShortcutResult = @(& (Join-Path $PSScriptRoot 'shortcut.ps1') -ShortcutDirectory $ShortcutDirectory) }
    else { $ShortcutResult = @(& (Join-Path $PSScriptRoot 'shortcut.ps1')) }
    $CreatedShortcut = $ShortcutResult -contains 'SHORTCUT-OK: created'
    $ShortcutResult | Write-Output
  }
  $Receipt.phase = 'committed'
  Write-ReceiptAtomically $Receipt
} catch {
  $FailedValue = $null
  try { $FailedValue = (Get-ItemProperty -Path $RunKey -Name $RunName -ErrorAction Stop).$RunName } catch { }
  if ($FailedValue -eq $Command) {
    if ($null -ne $CurrentValue) { Set-ItemProperty -Path $RunKey -Name $RunName -Value $CurrentValue }
    else { Remove-ItemProperty -Path $RunKey -Name $RunName -ErrorAction SilentlyContinue }
  }
  if ($null -ne $Existing) { Write-ReceiptAtomically $Existing }
  else { Remove-Item -LiteralPath $ReceiptPath -Force }
  if ($CreatedShortcut) {
    & (Join-Path $PSScriptRoot 'shortcut.ps1') -Remove
    if ($null -ne $PriorShortcutReceipt) { Write-EvaReceipt $ShortcutReceiptPath ([Text.Encoding]::UTF8.GetString($PriorShortcutReceipt) | ConvertFrom-Json) }
    if ($null -ne $PriorShortcutIcon -and -not (Test-Path -LiteralPath $ShortcutIconPath)) { [IO.File]::WriteAllBytes($ShortcutIconPath, $PriorShortcutIcon) }
  }
  throw
}
Write-Output "安装收据：$ReceiptPath"
Write-Output '伴随程序已注册自启；只有检测到本机调试入口及已验证版本后才会接入。'
if ($StartCompanion) {
  try { & (Join-Path $PSScriptRoot 'start.ps1') -NodePath $Node }
  catch { throw ('安装配置已保存，但本次伴随程序启动失败：' + $_.Exception.Message) }
}
