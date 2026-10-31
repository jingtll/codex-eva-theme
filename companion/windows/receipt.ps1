# Shared receipt persistence. EFS can reject ReplaceFile even when read/write and
# same-directory moves work. A fixed recovery file makes the two-move fallback recoverable.
function Read-EvaReceipt([string]$Path) {
  $Recovery = $Path + '.recovery'
  if (-not (Test-Path -LiteralPath $Path) -and (Test-Path -LiteralPath $Recovery -PathType Leaf)) { [IO.File]::Move($Recovery, $Path) }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

function Write-EvaReceipt([string]$Path, $Value) {
  $Directory = Split-Path -Parent $Path
  $Temporary = Join-Path $Directory ('receipt-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  $Recovery = $Path + '.recovery'
  try {
    [IO.File]::WriteAllText($Temporary, ($Value | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { [IO.File]::Move($Temporary, $Path); return }
    try { [IO.File]::Replace($Temporary, $Path, ($Temporary + '.bak')) }
    catch [System.UnauthorizedAccessException] {
      if (Test-Path -LiteralPath $Recovery -PathType Leaf) { Remove-Item -LiteralPath $Recovery -Force }
      [IO.File]::Move($Path, $Recovery)
      try { [IO.File]::Move($Temporary, $Path) } catch { [IO.File]::Move($Recovery, $Path); throw }
      Remove-Item -LiteralPath $Recovery -Force -ErrorAction SilentlyContinue
    }
  } finally {
    foreach ($OwnedPath in @($Temporary, ($Temporary + '.bak'))) {
      if (Test-Path -LiteralPath $OwnedPath -PathType Leaf) { Remove-Item -LiteralPath $OwnedPath -Force }
    }
  }
}
