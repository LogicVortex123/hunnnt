# Architecture

## Planes
- Control plane: Next.js dashboard, API, orchestrator, workflow state machine.
- Worker plane: two registered laptop nodes, JEV service, Claude adapter, local Cursor IDE bridge.
- Data plane: Firestore canonical records; Firebase Storage for larger artifacts; JSON snapshots for export/audit.

## Agent boundaries
- JEV: classification, relevance, skill matching, rough effort and duplicate candidates.
- Claude: bounty research, reward/eligibility/deadline/acceptance evidence, independent code/PR review.
- Cursor: repository investigation, reproduction, implementation, tests, security and PR preparation.
- Backend: deterministic verification, ranking, leases, approvals, status transitions and payment confirmation.

## Cursor deployment note
Cursor is an IDE/agent environment. This design does not assume a supported headless Cursor server API. A local bridge can exchange approved task packages and reports with the orchestrator, while Cursor performs work in an isolated local workspace.
