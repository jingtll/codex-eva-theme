param([Parameter(Mandatory=$true)][uint32]$ProcessId)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class EvaPackageIdentity {
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern int GetPackageFullName(IntPtr handle,ref uint length,StringBuilder name);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern int GetApplicationUserModelId(IntPtr handle,ref uint length,StringBuilder name);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
$Handle=[EvaPackageIdentity]::OpenProcess(0x1000,$false,$ProcessId)
if($Handle -eq [IntPtr]::Zero){throw 'PROCESS_QUERY_DENIED'}
try {
 $Package=New-Object Text.StringBuilder 1024
 $App=New-Object Text.StringBuilder 1024
 [uint32]$PackageLength=1024;[uint32]$AppLength=1024
 $PackageCode=[EvaPackageIdentity]::GetPackageFullName($Handle,[ref]$PackageLength,$Package)
 $AppCode=[EvaPackageIdentity]::GetApplicationUserModelId($Handle,[ref]$AppLength,$App)
 @{pid=$ProcessId;packageCode=$PackageCode;package=$Package.ToString();appCode=$AppCode;appId=$App.ToString()}|ConvertTo-Json -Compress
} finally {[void][EvaPackageIdentity]::CloseHandle($Handle)}
