import { config } from "./config.js";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";
import { runDiscovery } from "./discovery/run.js";
import { getOpportunity, listOpportunities, saveOpportunities } from "./store.js";
import { score } from "./verify.js";
import type { Status } from "./types.js";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "1mb" }));

type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

app.get("/health", (_req, res) => {
  res.json({ service: "opportunityos-api", status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/v1", (_req, res) => {
  res.json({ name: "OpportunityOS API", version: "0.2.0", githubAuth: Boolean(config.githubToken) });
});

app.get("/api/v1/opportunities", route(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = (await listOpportunities())
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));
  // List view omits the long untrusted body.
  res.json(rows.map(({ description: _d, research: _r, ...rest }) => rest));
}));

app.get("/api/v1/opportunities/:id", route(async (req, res) => {
  const rec = await getOpportunity(String(req.params.id));
  if (!rec) return res.status(404).json({ error: "Not found" });
  res.json(rec);
}));

app.post("/api/v1/discovery/run", route(async (_req, res) => {
  const result = await runDiscovery();
  logger.info(result, "discovery run finished");
  res.json(result);
}));

app.post("/api/v1/opportunities/:id/research", route(async (req, res) => {
  const rec = await getOpportunity(String(req.params.id));
  if (!rec) return res.status(404).json({ error: "Not found" });
  const at = new Date().toISOString();
  try {
    const r = await fetch(`${config.claudeUrl}/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opportunityId: rec.id,
        title: rec.title,
        description: rec.description.slice(0, 6000),
        sourceUrl: rec.source.url,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = (await r.json()) as { rawStructuredOutput?: string; error?: string };
    rec.research = r.ok
      ? { status: "completed", at, output: body.rawStructuredOutput }
      : { status: "failed", at, error: body.error ?? `HTTP ${r.status}` };
  } catch (err) {
    rec.research = { status: "failed", at, error: err instanceof Error ? err.message : "Claude adapter unreachable" };
  }
  rec.audit.push({ at, action: `RESEARCH:${rec.research.status.toUpperCase()}`, actor: "claude-adapter", note: rec.research.error });
  rec.updatedAt = at;
  await saveOpportunities([rec]);
  res.status(rec.research.status === "completed" ? 200 : 502).json(rec);
}));

// Local human decisions only. Nothing here touches GitHub or any external system.
const DECISIONS: Record<string, Status> = {
  select: "SELECTED",
  reject: "REJECTED",
  reset: "NEEDS_HUMAN_REVIEW",
};

app.post("/api/v1/opportunities/:id/decision", route(async (req, res) => {
  const decision = String((req.body as { decision?: unknown })?.decision ?? "");
  const next = DECISIONS[decision];
  if (!next) return res.status(400).json({ error: `decision must be one of ${Object.keys(DECISIONS).join(", ")}` });
  const rec = await getOpportunity(String(req.params.id));
  if (!rec) return res.status(404).json({ error: "Not found" });
  const at = new Date().toISOString();
  rec.audit.push({ at, action: `DECISION:${decision.toUpperCase()}`, actor: "dashboard-user", note: `${rec.status} -> ${next}` });
  rec.status = next;
  rec.score = score(rec);
  rec.updatedAt = at;
  await saveOpportunities([rec]);
  res.json(rec);
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "request failed");
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
});

app.listen(config.port, config.host, () => logger.info({ host: config.host, port: config.port }, "OpportunityOS API listening"));
