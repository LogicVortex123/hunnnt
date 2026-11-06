$ErrorActionPreference = "Stop"
Write-Host "=== OpportunityOS bootstrap ==="
foreach ($command in @("node", "npm", "git", "docker")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is missing. Install it and reopen PowerShell."
  }
  Write-Host "[OK] $command"
}
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "[INFO] Created .env. Add your local credentials."
}
corepack enable
corepack pnpm install
@("workspaces", "logs", "data/opportunities", "data/snapshots/daily") | ForEach-Object {
  New-Item -ItemType Directory -Force -Path $_ | Out-Null
}
Write-Host "Bootstrap complete."
