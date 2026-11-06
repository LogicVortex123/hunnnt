$ErrorActionPreference = "Stop"
if (-not (Test-Path ".env")) { throw ".env not found. Run bootstrap.ps1 first." }
$lines = Get-Content ".env"
$required = @("ANTHROPIC_API_KEY", "CLAUDE_MODEL")
foreach ($key in $required) {
  $line = $lines | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if (-not $line -or $line -match "=$") { Write-Host "[MISSING] $key" -ForegroundColor Yellow }
  else { Write-Host "[OK] $key is configured" }
}
Write-Host "Firebase credentials are required when Firestore persistence is enabled."
