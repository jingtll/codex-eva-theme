$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $PSScriptRoot 'ClickLauncher.cs'
$Build = Join-Path $Root 'build'
$Target = Join-Path $Build 'CodexEvaLauncher.exe'
$ReceiptPath = Join-Path $Build 'launcher-build.json'
function Get-LauncherHash([string]$Path) {
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($Hasher.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-', '').ToLowerInvariant() }
  finally { $Hasher.Dispose() }
}
$SourceHash = Get-LauncherHash $Source
$Existing = $null
if (Test-Path -LiteralPath $ReceiptPath) {
  $Existing = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
if (Test-Path -LiteralPath $Target) {
  $ActualHash = Get-LauncherHash $Target
  if ($null -eq $Existing -or $Existing.sha256 -ne $ActualHash) { throw 'LAUNCHER_BUILD_CONFLICT: 启动器已被修改，拒绝覆盖。' }
  if ($Existing.sourceSha256 -eq $SourceHash) { $Existing | ConvertTo-Json -Compress; return }
}
$Compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $Compiler)) { $Compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $Compiler)) { throw 'LAUNCHER_COMPILER_MISSING: 未找到 Windows .NET Framework 编译器。' }
New-Item -ItemType Directory -Path $Build -Force | Out-Null
$Temporary = Join-Path $Build (([guid]::NewGuid().ToString('N')) + '.exe')
try {
  $Output = & $Compiler /nologo /target:winexe /reference:System.Windows.Forms.dll "/out:$Temporary" $Source 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('LAUNCHER_BUILD_FAILED: ' + ($Output -join "`n")) }
  $Receipt = @{path=$Target;sha256=(Get-LauncherHash $Temporary);sourceSha256=$SourceHash}
  if (Test-Path -LiteralPath $Target) { [IO.File]::Replace($Temporary,$Target,($Temporary+'.bak')) }
  else { [IO.File]::Move($Temporary,$Target) }
  [IO.File]::WriteAllText($ReceiptPath,($Receipt | ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding $false))
  $Receipt | ConvertTo-Json -Compress
} finally {
  Remove-Item -LiteralPath $Temporary -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath ($Temporary+'.bak') -Force -ErrorAction SilentlyContinue
}
