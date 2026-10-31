param(
  [string]$ShortcutDirectory = [Environment]::GetFolderPath('Desktop'),
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'receipt.ps1')
$DataDirectory = Join-Path $env:APPDATA 'CodexEva'
$ReceiptPath = Join-Path $DataDirectory 'shortcut-receipt.json'
$ShortcutPath = [IO.Path]::GetFullPath((Join-Path $ShortcutDirectory 'Codex EVA.lnk'))
$Launcher = Join-Path $PSScriptRoot 'launch.ps1'
$IconPath = Join-Path $DataDirectory 'shortcut-codex.ico'
$Receipt = Read-EvaReceipt $ReceiptPath

function Get-Hash([string]$Path) {
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($Hasher.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-', '').ToLowerInvariant() }
  finally { $Hasher.Dispose() }
}

function Write-ShortcutReceipt($Value) {
  Write-EvaReceipt $ReceiptPath $Value
}

function Copy-LinkBytes([string]$Source, [string]$Destination) {
  # AppData may use EFS. Copy bytes rather than inheriting its encryption metadata.
  $Bytes = [IO.File]::ReadAllBytes($Source)
  $Stream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew)
  try { $Stream.Write($Bytes, 0, $Bytes.Length) } catch {
    $Stream.Dispose()
    Remove-Item -LiteralPath $Destination -Force
    throw
  } finally { $Stream.Dispose() }
}

if ($Remove) {
  if ($null -eq $Receipt) { return }
  if ([IO.Path]::GetFileName($Receipt.path) -ne 'Codex EVA.lnk' -or -not [IO.Path]::IsPathRooted($Receipt.path)) { throw 'SHORTCUT_RECEIPT_INVALID' }
  if (-not $PSBoundParameters.ContainsKey('ShortcutDirectory')) {
    $ShortcutDirectory = [IO.Path]::GetDirectoryName($Receipt.path)
    $ShortcutPath = [IO.Path]::GetFullPath($Receipt.path)
  }
  if ($Receipt.path -ne $ShortcutPath) { throw 'SHORTCUT_LOCATION_CHANGED: 请使用原 ShortcutDirectory 卸载快捷方式。' }
  $KeepShortcut = $false
  if (Test-Path -LiteralPath $ShortcutPath -PathType Leaf) {
    if ((Get-Hash $ShortcutPath) -eq $Receipt.sha256) { Remove-Item -LiteralPath $ShortcutPath -Force }
    else { $KeepShortcut = $true; Write-Output 'SHORTCUT-OK: user shortcut kept' }
  }
  if (-not $KeepShortcut -and $Receipt.iconSha256 -and (Test-Path -LiteralPath $IconPath -PathType Leaf) -and (Get-Hash $IconPath) -eq $Receipt.iconSha256) { Remove-Item -LiteralPath $IconPath -Force }
  if ($Receipt.temporaryName -match '^shortcut-build-[a-f0-9]{32}\.lnk$') {
    $StagingDirectories = @($DataDirectory)
    if ($Receipt.temporaryDirectory -eq 'desktop') { $StagingDirectories += $ShortcutDirectory }
    foreach ($StagingDirectory in $StagingDirectories) {
      $Unfinished = Join-Path $StagingDirectory $Receipt.temporaryName
      if ((Test-Path -LiteralPath $Unfinished -PathType Leaf) -and (Get-Hash $Unfinished) -eq $Receipt.sha256) { Remove-Item -LiteralPath $Unfinished -Force }
    }
  }
  Remove-Item -LiteralPath $ReceiptPath -Force
  Remove-Item -LiteralPath ($ReceiptPath + '.recovery') -Force -ErrorAction SilentlyContinue
  return
}

if ($null -ne $Receipt -and $Receipt.path -eq $ShortcutPath -and $Receipt.phase -eq 'prepared' -and $Receipt.temporaryName -match '^shortcut-build-[a-f0-9]{32}\.lnk$') {
  $Unfinished = Join-Path $DataDirectory $Receipt.temporaryName
  if ($Receipt.temporaryDirectory -eq 'desktop') {
    $SourceLink = $Unfinished
    $Unfinished = Join-Path $ShortcutDirectory $Receipt.temporaryName
    if (-not (Test-Path -LiteralPath $Unfinished) -and (Test-Path -LiteralPath $SourceLink -PathType Leaf) -and (Get-Hash $SourceLink) -eq $Receipt.sha256) { Copy-LinkBytes $SourceLink $Unfinished }
    if ((Test-Path -LiteralPath $SourceLink -PathType Leaf) -and (Get-Hash $SourceLink) -eq $Receipt.sha256) { Remove-Item -LiteralPath $SourceLink -Force }
  }
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
$PublicationShortcut = Join-Path $ShortcutDirectory $TemporaryName
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
$PublicationOwned = $false
try {
  $Link.Save()
  $NewReceipt = @{version = 1; phase = 'prepared'; path = $ShortcutPath; temporaryName = $TemporaryName; temporaryDirectory = 'desktop'; sha256 = (Get-Hash $TemporaryShortcut)}
  if ($OwnedIconHash) { $NewReceipt.iconSha256 = $OwnedIconHash }
  Write-ShortcutReceipt $NewReceipt
  $Prepared = $true
  # Move refuses an existing destination, including a shortcut created after preflight.
  Copy-LinkBytes $TemporaryShortcut $PublicationShortcut
  $PublicationOwned = $true
  [IO.File]::Move($PublicationShortcut, $ShortcutPath)
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
  if ($PublicationOwned -and (Test-Path -LiteralPath $PublicationShortcut -PathType Leaf) -and (Get-Hash $PublicationShortcut) -eq $NewReceipt.sha256) { Remove-Item -LiteralPath $PublicationShortcut -Force }
}
Write-Output 'SHORTCUT-OK: created'
