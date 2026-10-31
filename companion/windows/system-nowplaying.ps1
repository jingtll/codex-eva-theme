# Derived from dsh-plugin-eva-theme/lib/system-nowplaying.ps1.
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 The dsh-eva-magi-theme authors
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
# dsh-plugin-eva-theme —— Windows 系统媒体桥。
#
# 读取 Windows 暴露给桌面应用的「系统媒体传输控件」(GSMTC) 会话，并只发送
# 三个白名单动作。由 lib/host-media.mjs 这样调用：
#
#   powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File system-nowplaying.ps1 read
#   powershell.exe ... -File system-nowplaying.ps1 <playpause|next|previous> <来源 id>
#   powershell.exe ... -File system-nowplaying.ps1 serve
#
# 前两种是一次性调用：读一次或做一次动作后退出，适合手工排查与测试。
# serve 是插件实际使用的方式：常驻进程从 stdin 读一行请求、往 stdout 写一行 JSON，
# 因为 Windows PowerShell 每次启动都要 1 秒左右，而起进程的频率跟轮询一样高。
# 请求行格式为 `read` 或 `<动作>\t<来源 id>`（制表符分隔，来源 id 里可以有空格）。
#
# 来源 id 只参与 -eq 比较，永远不会被拼进命令，所以恶意 id 无法变成脚本代码。
# 输出固定为一行 JSON：任何失败路径都打印 {ok:false,code:...}，不向调用方抛异常。
# 文件带 UTF-8 BOM：Windows PowerShell 5.1 在没有 BOM 时按 ANSI 解析，注释中的
# 中文会变成乱码；界面显示名由宿主的 JS 侧（lib/host-nowplaying.mjs）负责。

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

# 动作 → GSMTC 会话方法。宿主已先做一次白名单校验，这里是第二道闸门。
$Actions = @{
  playpause = 'TryTogglePlayPauseAsync'
  next      = 'TrySkipNextAsync'
  previous  = 'TrySkipPreviousAsync'
  play      = 'TryPlayAsync'
  pause     = 'TryPauseAsync'
}

$SourceArgs = @($args)

function Write-BridgeJson($Payload) {
  [Console]::Out.Write((ConvertTo-Json -InputObject $Payload -Compress -Depth 4))
  [Console]::Out.Write([Environment]::NewLine)
  [Console]::Out.Flush()
}

function Await-Operation($Operation, [type]$ResultType, [int]$TimeoutMs = 4000) {
  $Task = $script:AsTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  if (-not $Task.Wait($TimeoutMs)) { throw 'WinRT 操作超时' }
  return $Task.Result
}

# Windows PowerShell 5.1 自带 WinRT 投影；PowerShell 7 需要额外模块，因此固定用 5.1。
function Initialize-Bridge {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
  $script:AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  if ($null -eq $script:AsTaskGeneric) { throw '找不到 AsTask 辅助方法' }
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
  $script:Manager = Await-Operation ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  if ($null -eq $script:Manager) { throw '系统媒体会话管理器不可用' }
}

function Get-SourceId($Session) {
  try { return [string]$Session.SourceAppUserModelId } catch { return '' }
}

# 控制：按来源 id 精确匹配会话，不受「当前谁在播」影响，避免误控另一个播放器。
function Invoke-MediaAction([string]$Action, [string]$Wanted) {
  if ($Wanted -eq '') { return @{ ok = $false; code = 'NO_APP' } }
  $Target = $null
  foreach ($Session in @($script:Manager.GetSessions())) {
    if ((Get-SourceId $Session) -eq $Wanted) { $Target = $Session; break }
  }
  if ($null -eq $Target) { return @{ ok = $false; code = 'NO_APP' } }
  $Sent = [bool](Await-Operation ($Target.($Actions[$Action])()) ([bool]))
  return @{
    ok = $Sent
    code = $(if ($Sent) { $null } else { 'CONTROL_UNAVAILABLE' })
    bundleId = $Wanted
  }
}

# 读取：优先正在播的会话，其次第一个暂停的会话；都没有就返回空状态。
function Read-NowPlaying {
  $Playing = $null
  $Paused = $null
  foreach ($Session in @($script:Manager.GetSessions())) {
    $Status = ''
    try { $Status = [string]$Session.GetPlaybackInfo().PlaybackStatus } catch { $Status = '' }
    if ($Status -eq 'Playing') { $Playing = $Session; break }
    if ($Status -eq 'Paused' -and $null -eq $Paused) { $Paused = $Session }
  }
  $Current = if ($null -ne $Playing) { $Playing } else { $Paused }
  if ($null -eq $Current) { return @{ ok = $false; code = 'NO_MEDIA'; source = 'system'; app = $null; playing = $false; state = '' } }

  $Source = Get-SourceId $Current
  $Properties = Await-Operation ($Current.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $Title = ''; $Artist = ''; $Album = ''
  if ($null -ne $Properties) {
    try { $Title = [string]$Properties.Title } catch { $Title = '' }
    try { $Artist = [string]$Properties.Artist } catch { $Artist = '' }
    try { $Album = [string]$Properties.AlbumTitle } catch { $Album = '' }
  }

  $Timeline = $null
  try { $Timeline = $Current.GetTimelineProperties() } catch { $Timeline = $null }
  $Duration = 0.0; $Position = 0.0
  if ($null -ne $Timeline) {
    try { $Duration = [double]$Timeline.EndTime.TotalSeconds } catch { $Duration = 0.0 }
    try { $Position = [double]$Timeline.Position.TotalSeconds } catch { $Position = 0.0 }
    # 系统只在应用上报时刷新 Position。播放中按上报时刻补一段（上限 5 秒，
    # 既不长时间漂移，也避免进度条在两次上报之间完全不动），再夹到曲目长度内。
    if ($null -ne $Playing) {
      try {
        $Elapsed = ([DateTimeOffset]::Now - $Timeline.LastUpdatedTime).TotalSeconds
        if ($Elapsed -gt 0) { $Position += [Math]::Min([double]$Elapsed, 5.0) }
      } catch { }
    }
    if ($Duration -gt 0) { $Position = [Math]::Min($Duration, [Math]::Max(0.0, $Position)) }
    elseif ($Position -lt 0) { $Position = 0.0 }
  }

  return @{
    ok = $true
    source = 'system'
    bundleId = $Source
    app = $Source
    playing = ($null -ne $Playing)
    state = $(if ($null -ne $Playing) { 'playing' } else { 'paused' })
    title = $Title
    artist = $Artist
    album = $Album
    duration = [Math]::Round($Duration, 3)
    position = [Math]::Round($Position, 3)
  }
}

# 一行请求 → 一个结果对象。serve 与一次性调用共用这段分发逻辑。
function Invoke-BridgeRequest([string]$Line) {
  $Fields = @($Line.Split("`t"))
  $Action = if ($Fields.Count -gt 0 -and $Fields[0] -ne '') { [string]$Fields[0] } else { 'read' }
  if ($Action -eq 'read') { return Read-NowPlaying }
  if (-not $Actions.ContainsKey($Action)) { return @{ ok = $false; code = 'ACTION' } }
  $Wanted = if ($Fields.Count -gt 1) { [string]$Fields[1] } else { '' }
  return Invoke-MediaAction $Action $Wanted
}

$Mode = if ($SourceArgs.Count -gt 0) { [string]$SourceArgs[0] } else { 'read' }

if ($Mode -eq 'serve') {
  # 常驻模式下只有我们的 JSON 能进 stdout，避免警告污染行协议。
  $ProgressPreference = 'SilentlyContinue'; $WarningPreference = 'SilentlyContinue'
  $VerbosePreference = 'SilentlyContinue'; $InformationPreference = 'SilentlyContinue'
  $Ready = $true
  try { Initialize-Bridge } catch { $Ready = $false }
  while ($true) {
    $Line = $null
    try { $Line = [Console]::In.ReadLine() } catch { break }
    if ($null -eq $Line) { break }
    if (-not $Ready) { Write-BridgeJson @{ ok = $false; code = 'SYSTEM_MEDIA_UNAVAILABLE' }; continue }
    try { Write-BridgeJson (Invoke-BridgeRequest $Line) }
    catch { Write-BridgeJson @{ ok = $false; code = 'SYSTEM_MEDIA_UNAVAILABLE' } }
  }
  return
}

if ($Mode -ne 'read' -and -not $Actions.ContainsKey($Mode)) {
  Write-BridgeJson @{ ok = $false; code = 'ACTION' }
  return
}

try {
  Initialize-Bridge
  if ($Mode -eq 'read') {
    Write-BridgeJson (Read-NowPlaying)
  } else {
    $Wanted = if ($SourceArgs.Count -gt 1) { [string]$SourceArgs[1] } else { '' }
    Write-BridgeJson (Invoke-MediaAction $Mode $Wanted)
  }
} catch {
  Write-BridgeJson @{ ok = $false; code = 'SYSTEM_MEDIA_UNAVAILABLE' }
}
