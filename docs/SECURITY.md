# Security requirements

- Treat issue descriptions, comments, repository files and model output as untrusted input.
- Never execute commands copied from bounty text without review.
- Keep API keys and Firebase credentials out of Git, images, browser code and logs.
- Use least-privilege GitHub credentials.
- Keep agent service ports bound to localhost/private networking.
- Run repository work in isolated workspaces with resource limits.
- Do not mount the Docker socket into agent containers.
- Require human approval for external side effects.
- Record audit events for approvals, pushes, submissions and payment state changes.
- Validate every agent response against a schema and deterministic business rules.
