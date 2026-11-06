import { createHash } from "node:crypto";
import { config } from "../config.js";
import { getOpportunity, saveOpportunities } from "../store.js";
import { HUMAN_OWNED, type Classification, type OpportunityRecord } from "../types.js";
import { repoRisks, score, titleKey, verify, type RepoContext } from "../verify.js";
import { QUERIES, parseReward, searchIssues, type GithubIssue } from "./github.js";
import { getRepos } from "./repos.js";

export interface DiscoveryResult {
  startedAt: string;
  finishedAt: string;
  fetched: number;
  created: number;
  updated: number;
  errors: string[];
}

async function classify(id: string, issue: GithubIssue): Promise<Classification | null> {
  try {
    const res = await fetch(`${config.jevUrl}/classify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opportunity_id: id,
        title: issue.title,
        description: issue.body.slice(0, 4000),
        technologies: issue.labels.slice(0, 20),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const { opportunity_id: _ignored, ...rest } = (await res.json()) as Classification & { opportunity_id: string };
    return rest;
  } catch {
    return null;
  }
}

function toRecord(issue: GithubIssue, existing: OpportunityRecord | undefined, now: string): OpportunityRecord {
  const key = `github:${issue.repository}#${issue.number}`.toLowerCase();
  const fingerprint = createHash("sha256").update(key).digest("hex");
  const reward = parseReward(issue);
  return {
    schemaVersion: "1.0",
    id: existing?.id ?? fingerprint.slice(0, 16),
    fingerprint,
    title: issue.title,
    description: issue.body,
    source: {
      platform: "github",
      url: issue.url,
      repository: issue.repository,
      issueNumber: issue.number,
      labels: issue.labels,
      query: issue.query,
    },
    reward: {
      amountMinor: reward.amountMinor,
      currency: reward.amountMinor !== null ? "USD" : null,
      // Never infer funding from an advertised number; only a human/research step may upgrade this.
      fundingStatus: existing?.reward.fundingStatus === "CONFIRMED" ? "CONFIRMED" : reward.amountMinor !== null ? "ADVERTISED" : "UNKNOWN",
      evidence: reward.evidence,
    },
    signals: {
      state: issue.state,
      assignees: issue.assignees,
      comments: issue.comments,
      issueCreatedAt: issue.createdAt,
      issueUpdatedAt: issue.updatedAt,
    },
    repo: existing?.repo ?? null,
    risks: [],
    classification: existing?.classification ?? null,
    verification: existing?.verification ?? { checks: [], verifiedAt: now },
    score: 0,
    research: existing?.research ?? null,
    status: existing?.status ?? "DISCOVERED",
    audit: existing?.audit ?? [{ at: now, action: "DISCOVERED", actor: "discovery:github", note: issue.query }],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

let running: Promise<DiscoveryResult> | null = null;

/** Single-flight: concurrent callers share one run. */
export function runDiscovery(): Promise<DiscoveryResult> {
  running ??= doRun().finally(() => { running = null; });
  return running;
}

async function doRun(): Promise<DiscoveryResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const issues = new Map<string, GithubIssue>();

  for (const q of QUERIES) {
    try {
      for (const issue of await searchIssues(q)) {
        const key = `${issue.repository}#${issue.number}`.toLowerCase();
        if (!issues.has(key)) issues.set(key, issue);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Per-repo context: how much a single repo advertises across this run (bounty-farm signal).
  const ctx = new Map<string, RepoContext>();
  for (const issue of issues.values()) {
    const c = ctx.get(issue.repository) ?? { advertisedUsd: 0, issueCount: 0 };
    c.advertisedUsd += (parseReward(issue).amountMinor ?? 0) / 100;
    c.issueCount += 1;
    ctx.set(issue.repository, c);
  }
  const reposByTitle = new Map<string, Set<string>>();
  for (const issue of issues.values()) {
    const k = titleKey(issue.title);
    if (k.length < 12) continue; // too generic to compare
    const set = reposByTitle.get(k) ?? new Set<string>();
    set.add(issue.repository.toLowerCase());
    reposByTitle.set(k, set);
  }
  const repos = await getRepos([...ctx.keys()]);
  if ([...repos.values()].some((r) => r === null)) {
    errors.push("Some repository metadata was unavailable (GitHub rate limit?). Set GITHUB_TOKEN in .env for full trust checks.");
  }

  let created = 0;
  let updated = 0;
  const records: OpportunityRecord[] = [];
  const now = new Date().toISOString();

  for (const issue of issues.values()) {
    const id = createHash("sha256").update(`github:${issue.repository}#${issue.number}`.toLowerCase()).digest("hex").slice(0, 16);
    const existing = await getOpportunity(id);
    existing ? updated++ : created++;

    const rec = toRecord(issue, existing, now);
    rec.repo = repos.get(issue.repository) ?? rec.repo;
    rec.risks = repoRisks(rec, {
      ...(ctx.get(issue.repository) ?? { advertisedUsd: 0, issueCount: 1 }),
      crossPostedRepos: reposByTitle.get(titleKey(issue.title))?.size ?? 1,
    });
    rec.classification = (await classify(rec.id, issue)) ?? rec.classification;
    const { checks, outcome } = verify(rec);
    rec.verification = { checks, verifiedAt: now };
    if (!HUMAN_OWNED.has(rec.status) && rec.status !== outcome) {
      rec.audit.push({ at: now, action: `STATUS:${outcome}`, actor: "verifier" });
      rec.status = outcome;
    }
    rec.score = score(rec);
    records.push(rec);
  }

  await saveOpportunities(records);
  return { startedAt, finishedAt: new Date().toISOString(), fetched: issues.size, created, updated, errors };
}
