$ErrorActionPreference = "Stop"
docker compose -f infrastructure/docker/docker-compose.yml down
Write-Host "OpportunityOS local containers stopped."
