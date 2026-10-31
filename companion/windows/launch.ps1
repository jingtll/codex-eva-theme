param([ValidateRange(1024, 65535)][int]$DebugPort = 19327)
$ErrorActionPreference = 'Stop'

function Resolve-CodexExecutable {
  $Packages = @(Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop)
  if ($Packages.Count -ne 1) { throw 'CODEX_INSTALL_NOT_UNIQUE: 未找到唯一的官方 Codex 安装。' }
  $Executable = Join-Path $Packages[0].InstallLocation 'app\ChatGPT.exe'
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'CODEX_EXECUTABLE_MISSING: 请修复或更新官方客户端。' }
  return $Executable
}

function Resolve-CodexLaunchAlias {
  $Packages = @(Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop)
  if ($Packages.Count -ne 1) { throw 'CODEX_INSTALL_NOT_UNIQUE: 未找到唯一的官方 Codex 安装。' }
  $Manifest = Get-AppxPackageManifest -Package $Packages[0].PackageFullName -ErrorAction Stop
  $Applications = @($Manifest.SelectNodes("//*[local-name()='Application' and @Id='App']"))
  if ($Applications.Count -ne 1 -or $Applications[0].GetAttribute('Executable').Replace('/', '\') -ine 'app\ChatGPT.exe') {
    throw 'CODEX_ALIAS_REGISTRATION_CHANGED: 官方主入口已变化，需要重新验证。'
  }
  $Aliases = @($Applications[0].SelectNodes(".//*[local-name()='ExecutionAlias']") | Where-Object { $_.GetAttribute('Alias') -eq 'chatgpt-desktop.exe' })
  $AliasPath = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\chatgpt-desktop.exe'
  if ($Aliases.Count -ne 1 -or -not (Test-Path -LiteralPath $AliasPath -PathType Leaf)) {
    throw 'CODEX_ALIAS_UNAVAILABLE: 请在 Windows 应用执行别名设置中启用 chatgpt-desktop.exe，或修复官方安装。'
  }
  return $AliasPath
}

function Start-EvaCodex {
  $Executable = Resolve-CodexExecutable
  $LaunchAlias = Resolve-CodexLaunchAlias
  $MainProcesses = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" -ErrorAction Stop | Where-Object {
    $_.ExecutablePath -eq $Executable -and $_.CommandLine -notmatch '(?:^|\s)--type='
  })
  foreach ($Main in $MainProcesses) {
    if ($Main.CommandLine -notmatch ('(?:^|\s)--remote-debugging-port=' + $DebugPort + '(?:\s|$)')) {
      throw 'CODEX_RESTART_REQUIRED: Codex 正以普通模式运行。请先保存工作并完全退出，再从 Codex EVA 快捷方式打开；本程序不会关闭你的聊天。'
    }
  }
  $Node = (Get-Command node.exe -ErrorAction Stop).Source
  & (Join-Path $PSScriptRoot 'start.ps1') -NodePath $Node
  # The registered alias preserves package identity; the package's raw exe does not.
  Start-Process -FilePath $LaunchAlias -ArgumentList @("--remote-debugging-port=$DebugPort", '--remote-debugging-address=127.0.0.1')
}

if ($MyInvocation.InvocationName -ne '.') {
  try { Start-EvaCodex } catch {
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Codex EVA', 'OK', 'Information')
    exit 1
  }
}
