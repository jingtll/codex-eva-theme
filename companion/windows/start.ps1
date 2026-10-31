param([Parameter(Mandatory = $true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$Entry = Join-Path (Split-Path -Parent $PSScriptRoot) 'src\main.mjs'
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf) -or -not (Test-Path -LiteralPath $Entry -PathType Leaf)) { throw '伴随程序或 Node.js 已移动，请重新安装。' }
Start-Process -FilePath $NodePath -ArgumentList @(('"{0}"' -f $Entry)) -WindowStyle Hidden
