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

function Write-ShortcutReceipt($Value) {
  $Temporary = Join-Path $DataDirectory ('shortcut-receipt.' + [Guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [IO.File]::WriteAllText($Temporary, ($Value | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $ReceiptPath -PathType Leaf) { [IO.File]::Replace($Temporary, $ReceiptPath, ($Temporary + '.bak')) }
    else { [IO.File]::Move($Temporary, $ReceiptPath) }
  } finally {
    foreach ($OwnedPath in @($Temporary, ($Temporary + '.bak'))) {
      if (Test-Path -LiteralPath $OwnedPath -PathType Leaf) { Remove-Item -LiteralPath $OwnedPath -Force }
    }
  }
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
  if ($Receipt.temporaryName -match '^shortcut-build-[a-f0-9]{32}\.lnk$') {
    $Unfinished = Join-Path $DataDirectory $Receipt.temporaryName
    if ((Test-Path -LiteralPath $Unfinished -PathType Leaf) -and (Get-Hash $Unfinished) -eq $Receipt.sha256) { Remove-Item -LiteralPath $Unfinished -Force }
  }
  Remove-Item -LiteralPath $ReceiptPath -Force
  return
}

if ($null -ne $Receipt -and $Receipt.path -eq $ShortcutPath -and $Receipt.phase -eq 'prepared' -and $Receipt.temporaryName -match '^shortcut-build-[a-f0-9]{32}\.lnk$') {
  $Unfinished = Join-Path $DataDirectory $Receipt.temporaryName
  if ((Test-Path -LiteralPath $Unfinished -PathType Leaf) -and (Get-Hash $Unfinished) -eq $Receipt.sha256) {
    if (-not (Test-Path -LiteralPath $ShortcutPath)) {
      [IO.File]::Move($Unfinished, $ShortcutPath)
      $Receipt.phase = 'committed'
      try { Write-ShortcutReceipt $Receipt } catch {
        if ((Test-Path -LiteralPath $ShortcutPath -PathType Leaf) -and (Get-Hash $ShortcutPath) -eq $Receipt.sha256) { [IO.File]::Move($ShortcutPath, $Unfinished) }
        throw
      }
      Write-Output 'SHORTCUT-OK: created'
      return
    }
    if ((Test-Path -LiteralPath $ShortcutPath -PathType Leaf) -and (Get-Hash $ShortcutPath) -eq $Receipt.sha256) { Remove-Item -LiteralPath $Unfinished -Force }
  }
}
if (Test-Path -LiteralPath $ShortcutPath) {
  if ($null -ne $Receipt -and $Receipt.path -eq $ShortcutPath -and (Get-Hash $ShortcutPath) -eq $Receipt.sha256) {
    if ($Receipt.phase -eq 'prepared') { $Receipt.phase = 'committed'; Write-ShortcutReceipt $Receipt }
    Write-Output 'SHORTCUT-OK: already installed'
    return
  }
  throw 'SHORTCUT_CONFLICT: 同名快捷方式已存在或被修改，拒绝覆盖。'
}
if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) { throw 'SHORTCUT_LAUNCHER_MISSING' }
New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $ShortcutDirectory -Force | Out-Null
$Shell = New-Object -ComObject WScript.Shell
$TemporaryName = 'shortcut-build-' + [Guid]::NewGuid().ToString('N') + '.lnk'
$TemporaryShortcut = Join-Path $DataDirectory $TemporaryName
$Link = $Shell.CreateShortcut($TemporaryShortcut)
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
$Published = $false
$Prepared = $false
try {
  $Link.Save()
  $NewReceipt = @{version = 1; phase = 'prepared'; path = $ShortcutPath; temporaryName = $TemporaryName; sha256 = (Get-Hash $TemporaryShortcut)}
  if ($OwnedIconHash) { $NewReceipt.iconSha256 = $OwnedIconHash }
  Write-ShortcutReceipt $NewReceipt
  $Prepared = $true
  # Move refuses an existing destination, including a shortcut created after preflight.
  [IO.File]::Move($TemporaryShortcut, $ShortcutPath)
  $Published = $true
  $NewReceipt.phase = 'committed'
  Write-ShortcutReceipt $NewReceipt
} catch {
  if ($Published -and (Test-Path -LiteralPath $ShortcutPath -PathType Leaf) -and (Get-Hash $ShortcutPath) -eq $NewReceipt.sha256) { Remove-Item -LiteralPath $ShortcutPath -Force }
  if ($CreatedIcon) { Remove-Item -LiteralPath $IconPath -Force }
  if ($Prepared) {
    if ($null -ne $Receipt) { Write-ShortcutReceipt $Receipt }
    else { Remove-Item -LiteralPath $ReceiptPath -Force }
  }
  throw
} finally {
  if (Test-Path -LiteralPath $TemporaryShortcut -PathType Leaf) { Remove-Item -LiteralPath $TemporaryShortcut -Force }
}
Write-Output 'SHORTCUT-OK: created'
