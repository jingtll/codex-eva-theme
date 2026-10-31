param(
  [Parameter(Position = 0)][string]$Pilot,
  [Parameter(Position = 1)][string]$Kind,
  [Parameter(Position = 2)][double]$Volume = 0.7
)

$ErrorActionPreference = 'Stop'

$Cues = @{
  'asuka/approval' = 'asuka-voice-approval.mp3'
  'asuka/completed' = 'asuka-voice-complete.mp3'
  'rei/approval' = 'rei-voice-approval.mp3'
  'rei/completed' = 'rei-voice-complete.mp3'
}

$CueKey = "$Pilot/$Kind"
if (-not $Cues.ContainsKey($CueKey)) { exit 2 }
if ($Volume -lt 0.0 -or $Volume -gt 1.0) { exit 2 }

$AudioPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\assets\audio\$($Cues[$CueKey])"))
if (-not (Test-Path -LiteralPath $AudioPath -PathType Leaf)) { exit 3 }

try {
  Add-Type -AssemblyName PresentationCore
  Add-Type -AssemblyName WindowsBase
  $Player = New-Object System.Windows.Media.MediaPlayer
  $Player.Volume = $Volume
  $Frame = New-Object System.Windows.Threading.DispatcherFrame
  $Timer = New-Object System.Windows.Threading.DispatcherTimer
  $Timer.Interval = [TimeSpan]::FromSeconds(45)
  $Timer.add_Tick({
    $Timer.Stop()
    $Frame.Continue = $false
  })
  $Player.add_MediaOpened({ $Player.Play() })
  $Player.add_MediaEnded({ $Frame.Continue = $false })
  $Player.add_MediaFailed({ $Frame.Continue = $false })
  $Timer.Start()
  $Player.Open([Uri]$AudioPath)
  [System.Windows.Threading.Dispatcher]::PushFrame($Frame)
  $Timer.Stop()
  $Player.Close()
} catch {
  try { $Player.Close() } catch { }
  exit 4
}
