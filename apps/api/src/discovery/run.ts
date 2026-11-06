import { createHash } from "node:crypto";
import { config } from "../config.js";
import { getOpportunity, saveOpportunities } from "../store.js";
import { HUMAN_OWNED, type Classification, type OpportunityRecord } from "../types.js";
import { repoRisks, score, titleKey, verify, type RepoContext } from "../verify.js";
import {
  QUERIES, algoraReward, linkedPullRequests, parseReward, searchIssues, type GithubIssue,
} from "./github.js";
import { getRepos } from "./repos.js";

export interface DiscoveryResult {
  startedAt: string;
  finishedAt: string;
  fetched: number;
  created: number;
  updated: number;
  githubAuth: boolean;
  errors: string[];
}

const idFor = (repo: string, n: number) =>
  createHash("sha256").update(`github:${repo}#${n}`.toLowerCase()).digest("hex");

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
        comments: issue.comments,
        age_days: Math.max(0, Math.floor((Date.now() - Date.parse(issue.createdAt)) / 86_400_000)),
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

function toRecord(
  issue: GithubIssue,
  existing: OpportunityRecord | undefined,
  reward: { amountMinor: number | null; evidence: string | null },
  now: string,
): OpportunityRecord {
  const fingerprint = idFor(issue.repository, issue.number);
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
      // Never infer funding from an advertised number; only evidence-backed research may upgrade this.
      fundingStatus: existing?.reward.fundingStatus === "CONFIRMED" ? "CONFIRMED" : reward.amountMinor !== null ? "ADVERTISED" : "UNKNOWN",
      evidence: reward.evidence,
      platform: issue.algora ? "algora" : null,
    },
    signals: {
      state: issue.state,
      assignees: issue.assignees,
      comments: issue.comments,
      issueCreatedAt: issue.createdAt,
      issueUpdatedAt: issue.updatedAt,
      locked: issue.locked,
      linkedPRs: existing?.signals.linkedPRs ?? null,
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

/** Run fn over items with bounded concurrency. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
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
  const authed = Boolean(config.githubToken);

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

  // Rewards: labels/title/body first; Algora issues fall back to the bot comment (needs auth for volume).
  const rewards = new Map<string, { amountMinor: number | null; evidence: string | null }>();
  const needAlgora: GithubIssue[] = [];
  for (const [key, issue] of issues) {
    const r = parseReward(issue);
    rewards.set(key, r);
    if (r.amountMinor === null && issue.algora && authed) needAlgora.push(issue);
  }
  await pool(needAlgora, 6, async (issue) => {
    try {
      const r = await algoraReward(issue.repository, issue.number);
      if (r) rewards.set(`${issue.repository}#${issue.number}`.toLowerCase(), r);
    } catch { /* leave unknown */ }
  });

  // Per-repo context: how much a single repo advertises across this run (bounty-farm signal).
  const ctx = new Map<string, RepoContext>();
  const reposByTitle = new Map<string, Set<string>>();
  for (const [key, issue] of issues) {
    const c = ctx.get(issue.repository) ?? { advertisedUsd: 0, issueCount: 0 };
    c.advertisedUsd += (rewards.get(key)?.amountMinor ?? 0) / 100;
    c.issueCount += 1;
    ctx.set(issue.repository, c);
    const k = titleKey(issue.title);
    if (k.length >= 12) {
      const set = reposByTitle.get(k) ?? new Set<string>();
      set.add(issue.repository.toLowerCase());
      reposByTitle.set(k, set);
    }
  }
  const repos = await getRepos([...ctx.keys()]);
  if ([...repos.values()].some((r) => r === null)) {
    errors.push(authed
      ? "Some repository metadata could not be fetched."
      : "Repository metadata unavailable (anonymous GitHub rate limit). Set GITHUB_TOKEN or GITHUB_TOKEN_FROM_GH=true in .env.");
  }

  let created = 0;
  let updated = 0;
  const records: OpportunityRecord[] = [];
  const now = new Date().toISOString();

  for (const [key, issue] of issues) {
    const id = idFor(issue.repository, issue.number).slice(0, 16);
    const existing = await getOpportunity(id);
    if (existing) updated++; else created++;

    const rec = toRecord(issue, existing, rewards.get(key)!, now);
    rec.repo = repos.get(issue.repository) ?? rec.repo;
    rec.classification = (await classify(rec.id, issue)) ?? rec.classification;
    records.push(rec);
  }

  // Competing PRs: one timeline call per plausible candidate (skip closed/assigned/stale ones).
  if (authed) {
    const candidates = records.filter((r) => r.signals.state === "open" && r.signals.assignees.length === 0);
    await pool(candidates, 6, async (r) => {
      try {
        r.signals.linkedPRs = await linkedPullRequests(r.source.repository, r.source.issueNumber);
      } catch { /* keep previous */ }
    });
  }

  for (const rec of records) {
    rec.risks = repoRisks(rec, {
      ...(ctx.get(rec.source.repository) ?? { advertisedUsd: 0, issueCount: 1 }),
      crossPostedRepos: reposByTitle.get(titleKey(rec.title))?.size ?? 1,
    });
    const { checks, outcome } = verify(rec);
    rec.verification = { checks, verifiedAt: now };
    if (!HUMAN_OWNED.has(rec.status) && rec.status !== outcome) {
      rec.audit.push({ at: now, action: `STATUS:${outcome}`, actor: "verifier" });
      rec.status = outcome;
    }
    rec.score = score(rec);
  }

  await saveOpportunities(records);
  return { startedAt, finishedAt: new Date().toISOString(), fetched: issues.size, created, updated, githubAuth: authed, errors };
}
