# Pipeline

1. Discover candidate listings through source adapters.
2. Normalize and fingerprint each listing; deduplicate transactionally.
3. Ask JEV to classify and prioritize.
4. Ask Claude to research official bounty terms and collect evidence.
5. Ask Cursor to inspect the repository for promising candidates.
6. Run deterministic verification; route unknowns to human review.
7. Rank only eligible verified opportunities.
8. Developer selects a bounty and approves the work plan.
9. Cursor implements in an isolated workspace and records test evidence.
10. CI and deterministic submission gates run.
11. Claude independently reviews the diff and acceptance criteria.
12. Cursor addresses review findings; repeat review as needed.
13. Human approves PR/portal submission.
14. Track maintainer feedback, acceptance, and payment as distinct states.

Never infer funding from an advertised reward. Never claim a bounty, push upstream, submit a PR, accept program terms, or initiate payout without explicit authorization.
