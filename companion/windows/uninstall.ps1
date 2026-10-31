# Removes only what install.ps1 created, and only while it still matches the receipt.
# Run with Windows PowerShell 5.1:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1
& (Join-Path $PSScriptRoot 'install.ps1') -Uninstall
exit $LASTEXITCODE
