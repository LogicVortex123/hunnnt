import { config } from "./config.js";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";
import { runDiscovery } from "./discovery/run.js";
import { getOpportunity, listOpportunities, saveOpportunities } from "./store.js";
import { score, verify } from "./verify.js";
import { ResearchReportSchema } from "@opportunityos/schemas/research";
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
  res.json(rows.map(({ description: _d, research, ...rest }) => ({
    ...rest,
    researchRecommendation: research?.report?.recommendation ?? null,
  })));
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

/**
 * Request research. Without an Anthropic API key the request is queued for Claude Code
 * (GET /api/v1/research/queue); with a key it calls the Claude adapter directly.
 */
app.post("/api/v1/opportunities/:id/research", route(async (req, res) => {
  const rec = await getOpportunity(String(req.params.id));
  if (!rec) return res.status(404).json({ error: "Not found" });
  const at = new Date().toISOString();

  if (!process.env.ANTHROPIC_API_KEY) {
    if (!rec.researchRequestedAt) {
      rec.researchRequestedAt = at;
      rec.audit.push({ at, action: "RESEARCH:REQUESTED", actor: "dashboard-user", note: "queued for Claude Code" });
      rec.updatedAt = at;
      await saveOpportunities([rec]);
    }
    return res.status(202).json({ queued: true, message: "Queued. Claude Code will research it and post a report." });
  }

  const previous = rec.research;
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
      ? { status: "completed", at, agent: "claude-adapter", output: body.rawStructuredOutput }
      : { status: "failed", at, agent: "claude-adapter", error: body.error ?? `HTTP ${r.status}` };
  } catch (err) {
    rec.research = { status: "failed", at, error: err instanceof Error ? err.message : "Claude adapter unreachable" };
  }
  const failed = rec.research.status === "failed";
  rec.audit.push({ at, action: `RESEARCH:${rec.research.status.toUpperCase()}`, actor: "claude-adapter", note: rec.research.error });
  if (failed && previous?.report) rec.research = previous; // never let a failed call wipe an existing report
  rec.updatedAt = at;
  await saveOpportunities([rec]);
  res.status(failed ? 502 : 200).json(rec);
}));

/** Bounties the user asked to research that have no report newer than the request. */
app.get("/api/v1/research/queue", route(async (_req, res) => {
  const rows = (await listOpportunities()).filter((r) =>
    r.researchRequestedAt && !(r.research?.report && r.research.at >= r.researchRequestedAt));
  res.json(rows.map((r) => ({
    id: r.id, title: r.title, url: r.source.url, repository: r.source.repository,
    issueNumber: r.source.issueNumber, requestedAt: r.researchRequestedAt,
  })));
}));

// Research reports from Claude Code (lead agent / subagents) when no Anthropic API key is configured.
app.post("/api/v1/opportunities/:id/research/report", route(async (req, res) => {
  const rec = await getOpportunity(String(req.params.id));
  if (!rec) return res.status(404).json({ error: "Not found" });
  const parsed = ResearchReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid research report", details: parsed.error.flatten() });
  const report = parsed.data;
  const at = new Date().toISOString();
  const agent = String(req.header("x-agent") ?? "claude-code").slice(0, 60);

  rec.research = { status: "completed", at, agent, report };
  rec.audit.push({ at, action: `RESEARCH:${report.recommendation.toUpperCase()}`, actor: agent, note: report.recommendationReason });
  // Funding may only be upgraded with cited evidence; the human still decides.
  if (report.reward.fundingStatus === "confirmed" && rec.reward.fundingStatus !== "CONFIRMED") {
    rec.reward.fundingStatus = "CONFIRMED";
    rec.audit.push({ at, action: "FUNDING:CONFIRMED", actor: agent, note: report.evidence.map((e) => e.url).join(" ") });
  }
  rec.verification = { checks: verify(rec).checks, verifiedAt: at };
  rec.score = score(rec);
  rec.updatedAt = at;
  await saveOpportunities([rec]);
  res.json({ id: rec.id, status: rec.status, recommendation: report.recommendation, score: rec.score });
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
