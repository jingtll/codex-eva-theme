param(
  [ValidateSet('Install','Start','Status','Uninstall')][string]$Action='Install',
  [switch]$Worker,
  [string]$ResponsePath
)
$ErrorActionPreference='Stop'
$CompanionRoot=Split-Path -Parent $PSScriptRoot
$Repository=Split-Path -Parent $CompanionRoot
$Responses=Join-Path $Repository '.cache\native-desktop'
. (Join-Path $PSScriptRoot 'desktop-context.ps1')

function Read-DesktopState {
  $Run=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue).CodexEvaCompanion
  $Approval=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' -ErrorAction SilentlyContinue).CodexEvaCompanion
  $Enabled=if(-not $Run){$false}elseif($Approval){$Approval[0] -in @(2,6)}else{$true}
  $Lock=Join-Path $env:APPDATA 'CodexEva\settings.json.lock'
  $Owner=0
  if(Test-Path -LiteralPath $Lock){
    $Stream=[IO.File]::Open($Lock,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $Reader=New-Object IO.StreamReader($Stream)
    try{[void][int]::TryParse($Reader.ReadToEnd(),[ref]$Owner)}finally{$Reader.Dispose()}
  }
  $Process=$null
  if($Owner -gt 0){$Process=Get-CimInstance Win32_Process -Filter "ProcessId=$Owner" -ErrorAction SilentlyContinue}
  $Entry=Join-Path $CompanionRoot 'src\main.mjs'
  $Alive=$null -ne $Process -and $Process.Name -ieq 'node.exe' -and $Process.CommandLine.Contains(('"{0}"' -f $Entry))
  return @{packageCode=(Get-EvaPackageCode);startupCommand=$Run;startupEnabled=$Enabled;ownerPid=$Owner;ownerAlive=$Alive;dataDirectory=(Join-Path $env:APPDATA 'CodexEva')}
}

if($Worker){
  $Full=[IO.Path]::GetFullPath($ResponsePath)
  if([IO.Path]::GetDirectoryName($Full) -ne [IO.Path]::GetFullPath($Responses) -or [IO.Path]::GetFileName($Full) -notmatch '^[a-f0-9]{32}\.json$'){throw 'INVALID_RESPONSE_PATH'}
  $Result=@{ok=$false;action=$Action}
  try{
    if((Get-EvaPackageCode) -ne 15700){throw 'NATIVE_DESKTOP_REQUIRED: 桌面助手仍携带包身份，已停止。'}
    if($Action -eq 'Install'){
      & (Join-Path $PSScriptRoot 'install.ps1') -StartCompanion | Out-Null
    }elseif($Action -eq 'Uninstall'){
      & (Join-Path $PSScriptRoot 'install.ps1') -Uninstall | Out-Null
    }elseif($Action -eq 'Start'){
      $Node=Find-EvaNode
      if(-not $Node){throw 'NODE_NOT_FOUND: 未找到 Node.js，请安装 Node.js 22 或更高版本。'}
      & (Join-Path $PSScriptRoot 'start.ps1') -NodePath $Node | Out-Null
    }
    $State=Read-DesktopState
    if($Action -in @('Install','Start')){
      for($Attempt=0;$Attempt -lt 100 -and -not $State.ownerAlive;$Attempt++){Start-Sleep -Milliseconds 100;$State=Read-DesktopState}
      if(-not $State.ownerAlive){throw 'COMPANION_NOT_READY: 已派发，但没有核实到独立伴随进程。'}
    }
    if($Action -eq 'Install'){
      $Receipt=Get-Content -LiteralPath (Join-Path $State.dataDirectory 'install-receipt.json') -Encoding UTF8 -Raw | ConvertFrom-Json
      if($Receipt.phase -ne 'committed' -or $State.startupCommand -ne $Receipt.registry.command){throw 'NATIVE_STARTUP_MISMATCH'}
      if(-not $State.startupEnabled){throw 'STARTUP_DISABLED: Windows 已禁用该启动项；安装配置已保留，未覆盖用户的禁用选择。'}
    }
    $Result=@{ok=$true;action=$Action;state=$State}
  }catch{$Result=@{ok=$false;action=$Action;error=$_.Exception.Message}}
  $Temporary=$Full+'.tmp'
  [IO.File]::WriteAllText($Temporary,($Result | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding $false))
  [IO.File]::Move($Temporary,$Full)
  exit
}

New-Item -ItemType Directory -Path $Responses -Force | Out-Null
$Response=Join-Path $Responses (([guid]::NewGuid().ToString('N'))+'.json')
$Script=Join-Path $PSScriptRoot 'desktop.ps1'
if($Script -match '["\r\n]' -or $Response -match '["\r\n]'){throw 'INVALID_LAUNCH_PATH'}
$Shell=New-Object -ComObject Shell.Application
$DesktopHwnd=0
$Desktop=$Shell.Windows().FindWindowSW(0,0,8,[ref]$DesktopHwnd,1)
if($null -eq $Desktop){throw 'DESKTOP_UNAVAILABLE'}
$PowerShell=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Arguments='-NoProfile -NonInteractive -File "{0}" -Worker -Action {1} -ResponsePath "{2}"' -f $Script,$Action,$Response
try{
  $Desktop.Document.Application.ShellExecute($PowerShell,$Arguments,$CompanionRoot,'',0)
  for($Attempt=0;$Attempt -lt 300 -and -not (Test-Path -LiteralPath $Response);$Attempt++){Start-Sleep -Milliseconds 100}
  if(-not(Test-Path -LiteralPath $Response)){throw 'DESKTOP_ACK_TIMEOUT: 未收到桌面助手确认，不能宣称安装或启动成功。'}
  $Result=Get-Content -LiteralPath $Response -Encoding UTF8 -Raw | ConvertFrom-Json
  if($Result.action -ne $Action -or $Result.ok -ne $true){throw ('DESKTOP_ACTION_FAILED: '+$Result.error)}
  $Result | ConvertTo-Json -Depth 5
}finally{Remove-Item -LiteralPath $Response -Force -ErrorAction SilentlyContinue}
