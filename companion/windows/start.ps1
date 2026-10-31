param([Parameter(Mandatory = $true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$Entry = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\main.mjs'
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf) -or -not (Test-Path -LiteralPath $Entry -PathType Leaf)) { throw '伴随程序或 Node.js 已移动，请重新安装。' }
# Ask the actual Explorer desktop to own the process, rather than the Store
# client, its terminal job or a WMI broker. ShellExecute has no child PID:
# desktop.ps1 separately verifies the native settings lock and live process.
if ($Entry -match '["\r\n]' -or $NodePath -match '["\r\n]') { throw 'INVALID_LAUNCH_PATH' }
$Shell = New-Object -ComObject Shell.Application
$DesktopHwnd = 0
$Desktop = $Shell.Windows().FindWindowSW(0, 0, 8, [ref]$DesktopHwnd, 1)
if ($null -eq $Desktop) { throw 'DESKTOP_UNAVAILABLE: Windows 桌面尚未就绪，未启动伴随程序。' }
$Desktop.Document.Application.ShellExecute($NodePath, ('"{0}"' -f $Entry), (Split-Path -Parent $PSScriptRoot), '', 0)
Write-Output 'COMPANION-DISPATCHED: 等待独立桌面进程就绪'
