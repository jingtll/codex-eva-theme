param([Parameter(Mandatory = $true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$Entry = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\main.mjs'
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf) -or -not (Test-Path -LiteralPath $Entry -PathType Leaf)) { throw '伴随程序或 Node.js 已移动，请重新安装。' }
# Start outside the launching terminal's Windows job. A normal child process
# is otherwise killed when the desktop agent/terminal job closes.
$Startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow = [uint16]0}
$Result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine = ('"{0}" "{1}"' -f $NodePath, $Entry)
  CurrentDirectory = Split-Path -Parent $PSScriptRoot
  ProcessStartupInformation = $Startup
}
if ($Result.ReturnValue -ne 0) { throw ('COMPANION_START_FAILED: Windows 返回 ' + $Result.ReturnValue) }
Write-Output ('COMPANION-OK: started PID ' + $Result.ProcessId)
