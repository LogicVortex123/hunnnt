$ErrorActionPreference = "Continue"
$targets = @(
  @{ Name = "JEV"; Url = "http://localhost:8100/health" },
  @{ Name = "Claude"; Url = "http://localhost:8200/health" }
)
foreach ($target in $targets) {
  try {
    Invoke-RestMethod -Uri $target.Url -TimeoutSec 5 | Out-Null
    Write-Host "[ONLINE] $($target.Name)" -ForegroundColor Green
  } catch {
    Write-Host "[OFFLINE] $($target.Name)" -ForegroundColor Red
  }
}
docker ps
