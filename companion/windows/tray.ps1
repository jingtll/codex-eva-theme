<#
  Codex EVA companion tray.

  Owns a single WinForms NotifyIcon and talks to the Node companion over stdin/stdout
  line-by-line JSON. It accepts no command line arguments and exposes no arbitrary
  command path: the only things it can start are the fixed menu actions below.

  stdin  <- {"type":"status","text":"..."}   status line for the tooltip and status item
  stdout -> {"action":"pause|resume|open-settings|quit"}
#>
$ErrorActionPreference = 'Stop'

try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:Paused = $false
$script:Status = '正在连接'

[System.Windows.Forms.Application]::EnableVisualStyles()

$script:Send = $null

$ContextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$StatusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$StatusItem.Text = '状态：正在连接'
$StatusItem.Enabled = $false
[void]$ContextMenu.Items.Add($StatusItem)
[void]$ContextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

function New-MenuItem([string]$Text, [string]$Action) {
  $Item = New-Object System.Windows.Forms.ToolStripMenuItem
  $Item.Text = $Text
  $Item.Tag = $Action
  $Item.add_Click([System.EventHandler]{
    param($Sender, $EventArgs)
    $script:Send.Invoke([string]$Sender.Tag)
  })
  return $Item
}

$PauseItem = New-MenuItem '暂停皮肤' 'pause'
$OpenItem = New-MenuItem '显示设置' 'open-settings'
$QuitItem = New-MenuItem '退出' 'quit'
[void]$ContextMenu.Items.Add($PauseItem)
[void]$ContextMenu.Items.Add($OpenItem)
[void]$ContextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
[void]$ContextMenu.Items.Add($QuitItem)

$script:Send = [System.Action[string]]{
  param([string]$Action)
  if ($Action -eq 'quit') {
    $script:Quit = $true
  } elseif ($Action -eq 'pause') {
    $Action = if ($script:Paused) { 'resume' } else { 'pause' }
    $script:Paused = -not $script:Paused
    $PauseItem.Text = if ($script:Paused) { '恢复皮肤' } else { '暂停皮肤' }
  }
  $Line = New-Object PSObject -Property @{ action = $Action }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $Line -Compress))
  [Console]::Out.Flush()
}

$Icon = New-Object System.Windows.Forms.NotifyIcon
$Icon.Text = 'Codex EVA 伴随程序：正在连接'
$Icon.Visible = $true
$Icon.ContextMenuStrip = $ContextMenu
try {
  $Icon.Icon = [System.Drawing.SystemIcons]::Application
} catch { }

$Timer = New-Object System.Windows.Forms.Timer
$Timer.Interval = 120

$script:Quit = $false
# Console.In.Peek blocks the UI thread when stdin has no data. Read only in a
# dedicated CLR thread; the WinForms timer drains a thread-safe queue.
Add-Type -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
public static class EvaTrayInput {
  public static readonly ConcurrentQueue<string> Lines = new ConcurrentQueue<string>();
  public static volatile bool Closed;
  public static void Start() {
    Task.Factory.StartNew(() => {
      try { string line; while ((line = Console.ReadLine()) != null) Lines.Enqueue(line); }
      finally { Closed = true; }
    }, TaskCreationOptions.LongRunning);
  }
}
"@
[EvaTrayInput]::Start()

$Timer.add_Tick({
  $Line = $null
  while ([EvaTrayInput]::Lines.TryDequeue([ref]$Line)) {
    try {
      $Message = $Line | ConvertFrom-Json
      if ($null -ne $Message.text) {
        $script:Status = [string]$Message.text
        $StatusItem.Text = "状态：$($script:Status)"
        $Suffix = if ($script:Paused) { ' · 已暂停' } else { '' }
        $Tooltip = "Codex EVA 伴随程序：$($script:Status)$Suffix"
        $Icon.Text = $Tooltip.Substring(0, [Math]::Min(63, $Tooltip.Length))
      }
    } catch { }
  }
  if ([EvaTrayInput]::Closed) { $script:Quit = $true }
  if ($script:Quit) {
    $Timer.Stop()
    $Icon.Visible = $false
    $Icon.Dispose()
    [System.Windows.Forms.Application]::Exit()
  }
})

$Timer.Start()
[System.Windows.Forms.Application]::Run()
