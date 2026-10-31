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
