param([ValidateSet("node_a", "node_b")][string]$NodeId = "node_a")
$ErrorActionPreference = "Stop"
$env:NODE_ID = $NodeId
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
Write-Host "Services started for $NodeId."
Write-Host "Start the worker in another terminal after the worker package is implemented."
