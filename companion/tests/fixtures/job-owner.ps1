$ErrorActionPreference = 'Stop'
# A disposable terminal job reproduces the lifetime boundary of a desktop agent.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EvaTestJob {
  [StructLayout(LayoutKind.Sequential)] public struct Basic {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr MinWorkingSet, MaxWorkingSet;
    public uint ActiveProcesses;
    public UIntPtr Affinity;
    public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Counters {
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Limits {
    public Basic Basic;
    public Counters Counters;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr security, string name);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job, int type, ref Limits limits, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
$Job = [EvaTestJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($Job -eq [IntPtr]::Zero) { throw 'JOB_CREATE_FAILED' }
try {
  $Limits = New-Object EvaTestJob+Limits
  $Basic = New-Object EvaTestJob+Basic
  $Basic.Flags = 0x2000 # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
  $Limits.Basic = $Basic
  if (-not [EvaTestJob]::SetInformationJobObject($Job, 9, [ref]$Limits, [Runtime.InteropServices.Marshal]::SizeOf($Limits))) { throw 'JOB_LIMIT_FAILED' }
  $Info = New-Object Diagnostics.ProcessStartInfo
  $Info.FileName = Join-Path $PSHOME 'powershell.exe'
  $Info.UseShellExecute = $false
  $Info.CreateNoWindow = $true
  $Info.RedirectStandardError = $true
  $Info.RedirectStandardOutput = $true
  $Info.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "while(-not (Test-Path -LiteralPath $env:EVA_TEST_GATE)){Start-Sleep -Milliseconds 20}; & $env:EVA_TEST_STARTER -NodePath $env:EVA_TEST_NODE"'
  $Parent = [Diagnostics.Process]::Start($Info)
  if (-not [EvaTestJob]::AssignProcessToJobObject($Job, $Parent.Handle)) { $Parent.Kill(); throw 'JOB_ASSIGN_FAILED' }
  [IO.File]::WriteAllText($env:EVA_TEST_GATE, 'go')
  if (-not $Parent.WaitForExit(15000)) { throw 'STARTER_TIMEOUT' }
  if ($Parent.ExitCode -ne 0) { throw ('STARTER_FAILED: ' + $Parent.StandardError.ReadToEnd()) }
  for ($Attempt = 0; $Attempt -lt 100 -and -not (Test-Path -LiteralPath $env:EVA_TEST_PID); $Attempt++) { Start-Sleep -Milliseconds 50 }
  if (-not (Test-Path -LiteralPath $env:EVA_TEST_PID)) { throw 'CHILD_NOT_STARTED' }
} finally { [void][EvaTestJob]::CloseHandle($Job) }
