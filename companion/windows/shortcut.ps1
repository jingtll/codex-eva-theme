param(
  [string]$ShortcutDirectory = [Environment]::GetFolderPath('Desktop'),
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$DataDirectory = Join-Path $env:APPDATA 'CodexEva'
$ReceiptPath = Join-Path $DataDirectory 'shortcut-receipt.json'
$ShortcutPath = [IO.Path]::GetFullPath((Join-Path $ShortcutDirectory 'Codex EVA.lnk'))
$Launcher = Join-Path $PSScriptRoot 'launch.ps1'
$IconPath = Join-Path $DataDirectory 'shortcut-codex.ico'
$Receipt = $null
if (Test-Path -LiteralPath $ReceiptPath -PathType Leaf) { $Receipt = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json }

function Get-Hash([string]$Path) {
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($Hasher.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-', '').ToLowerInvariant() }
  finally { $Hasher.Dispose() }
}

if ($Remove) {
  if ($null -eq $Receipt) { return }
  if ($Receipt.path -ne $ShortcutPath) { throw 'SHORTCUT_LOCATION_CHANGED: 请使用原 ShortcutDirectory 卸载快捷方式。' }
  $KeepShortcut = $false
  if (Test-Path -LiteralPath $ShortcutPath -PathType Leaf) {
    if ((Get-Hash $ShortcutPath) -eq $Receipt.sha256) { Remove-Item -LiteralPath $ShortcutPath -Force }
    else { $KeepShortcut = $true; Write-Output 'SHORTCUT-OK: user shortcut kept' }
  }
  if (-not $KeepShortcut -and $Receipt.iconSha256 -and (Test-Path -LiteralPath $IconPath -PathType Leaf) -and (Get-Hash $IconPath) -eq $Receipt.iconSha256) { Remove-Item -LiteralPath $IconPath -Force }
  Remove-Item -LiteralPath $ReceiptPath -Force
  return
}

if (Test-Path -LiteralPath $ShortcutPath) {
  if ($null -ne $Receipt -and $Receipt.path -eq $ShortcutPath -and (Get-Hash $ShortcutPath) -eq $Receipt.sha256) {
    Write-Output 'SHORTCUT-OK: already installed'
    return
  }
  throw 'SHORTCUT_CONFLICT: 同名快捷方式已存在或被修改，拒绝覆盖。'
}
if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) { throw 'SHORTCUT_LAUNCHER_MISSING' }
New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $ShortcutDirectory -Force | Out-Null
$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut($ShortcutPath)
$Link.TargetPath = Join-Path $PSHOME 'powershell.exe'
$Link.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $Launcher
$Link.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$Link.Description = '官方 Codex 客户端与 EVA 伴随程序；仅在本机开放调试端口。'
$Link.WindowStyle = 7
$CreatedIcon = $false
$OwnedIconHash = $null
try {
  . $Launcher
  $Executable = Resolve-CodexExecutable
  $Link.IconLocation = $Executable + ',0'
  if (-not (Test-Path -LiteralPath $IconPath)) {
    Add-Type -AssemblyName System.Drawing
    $Icon = [Drawing.Icon]::ExtractAssociatedIcon($Executable)
    $Stream = [IO.File]::Open($IconPath, [IO.FileMode]::CreateNew)
    $CreatedIcon = $true
    try { $Icon.Save($Stream) } finally { $Stream.Dispose(); $Icon.Dispose() }
    $OwnedIconHash = Get-Hash $IconPath
    $Link.IconLocation = $IconPath + ',0'
  } elseif ($Receipt.iconSha256 -and (Get-Hash $IconPath) -eq $Receipt.iconSha256) {
    $OwnedIconHash = $Receipt.iconSha256
    $Link.IconLocation = $IconPath + ',0'
  }
} catch {
  if ($CreatedIcon) { Remove-Item -LiteralPath $IconPath -Force; $CreatedIcon = $false }
  $Link.IconLocation = $Link.TargetPath + ',0'
}
try {
  $Link.Save()
  $NewReceipt = @{version = 1; path = $ShortcutPath; sha256 = (Get-Hash $ShortcutPath)}
  if ($OwnedIconHash) { $NewReceipt.iconSha256 = $OwnedIconHash }
  [IO.File]::WriteAllText($ReceiptPath, ($NewReceipt | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
} catch {
  # A failed receipt must not leave an untracked shortcut created by this run.
  if (Test-Path -LiteralPath $ShortcutPath -PathType Leaf) { Remove-Item -LiteralPath $ShortcutPath -Force }
  if ($CreatedIcon) { Remove-Item -LiteralPath $IconPath -Force }
  throw
}
Write-Output 'SHORTCUT-OK: created'
