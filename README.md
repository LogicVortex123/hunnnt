# OpportunityOS

A distributed bounty discovery, research, verification, engineering, submission, and payment-tracking platform.

## Current scaffold status

This ZIP contains a runnable **foundation scaffold**, not a finished autonomous bounty platform.

Included:
- pnpm/Turborepo monorepo
- Express API health endpoint
- FastAPI JEV service with a deterministic placeholder classifier
- Claude API adapter service with a structured research endpoint
- Firestore initialization helper
- shared Zod schemas
- Docker Compose for Claude and JEV
- Windows PowerShell bootstrap and node scripts
- architecture and pipeline documentation

Not yet implemented:
- production GitHub discovery adapter
- real JEV model integration/training
- full Claude research prompts and evidence extraction
- Cursor IDE automation (Cursor is treated as a local IDE/agent, not a headless Docker service)
- transactional Firestore job leasing and worker recovery
- complete dashboard, submission automation, CI, and payment-provider integrations

## Requirements

- Node.js 22+
- pnpm 9+
- Python 3.12+
- Docker Desktop
- Firebase project (optional for local health checks; required for Firestore persistence)
- Anthropic API key (required to call Claude research endpoint)

## Quick start (Windows PowerShell)

```powershell
corepack enable
.\infrastructure\scripts\bootstrap.ps1
Copy-Item .env.example .env
# Edit .env and set ANTHROPIC_API_KEY and Firebase settings as needed.
docker compose -f infrastructure/docker/docker-compose.yml up --build -d
corepack pnpm dev
```

The API is at http://localhost:4000/health, JEV at http://localhost:8100/health, and Claude adapter at http://localhost:8200/health.

## Workspace commands

```powershell
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm test
```

## Security

- Never commit `.env`, Firebase service-account JSON, GitHub private keys, or API keys.
- Do not expose agent service ports publicly.
- Treat bounty descriptions, repository content, issue comments, and agent output as untrusted input.
- Require human approval before claiming work, pushing upstream, submitting PRs, accepting terms, or initiating payouts.
- Use isolated workspaces and least-privilege credentials.
