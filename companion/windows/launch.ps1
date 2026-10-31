param([ValidateRange(1024, 65535)][int]$DebugPort = 19327)
$ErrorActionPreference = 'Stop'

function Resolve-CodexExecutable {
  $Packages = @(Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop)
  if ($Packages.Count -ne 1) { throw 'CODEX_INSTALL_NOT_UNIQUE: 未找到唯一的官方 Codex 安装。' }
  $Executable = Join-Path $Packages[0].InstallLocation 'app\ChatGPT.exe'
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'CODEX_EXECUTABLE_MISSING: 请修复或更新官方客户端。' }
  return $Executable
}

function Start-EvaCodex {
  $Executable = Resolve-CodexExecutable
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
  # Resolve the current package on every launch; never pin a versioned WindowsApps path.
  Start-Process -FilePath $Executable -ArgumentList @("--remote-debugging-port=$DebugPort", '--remote-debugging-address=127.0.0.1')
}

if ($MyInvocation.InvocationName -ne '.') {
  try { Start-EvaCodex } catch {
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Codex EVA', 'OK', 'Information')
    exit 1
  }
}
