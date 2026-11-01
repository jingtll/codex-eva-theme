function Find-EvaNode {
  $candidates = @(
    (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
  return $candidates | Select-Object -First 1
}

function Get-EvaPackageCode {
  if (-not ('EvaDesktopContext' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class EvaDesktopContext {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetCurrentPackageFullName(ref uint length, StringBuilder name);
}
'@
  }
  [uint32]$Length=1024
  $Name=New-Object Text.StringBuilder 1024
  return [EvaDesktopContext]::GetCurrentPackageFullName([ref]$Length,$Name)
}
