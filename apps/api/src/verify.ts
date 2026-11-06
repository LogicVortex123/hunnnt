import { config } from "./config.js";
import { ENDED_PROGRAMS } from "./discovery/ended-programs.js";
import type { Check, OpportunityRecord, Status } from "./types.js";

const DAY = 86_400_000;

/** Aggregate context across one discovery run (per repository). */
export interface RepoContext {
  advertisedUsd: number;
  issueCount: number;
  /** Distinct repos carrying this issue's normalised title in the same run. */
  crossPostedRepos?: number;
}

/** Normalise a bounty title so copy-pasted listings collide: drop amounts, brackets, emoji, filler words. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\$\s?[\d,.]+k?|\busdc?\b|\bbounty\b|\bescrowed\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48); // prefix: mirrors often truncate titles
}

/** Deterministic trust rules. Heuristics only: they flag and down-rank, they never auto-reject. */
export function repoRisks(r: OpportunityRecord, ctx: RepoContext | undefined, now = Date.now()): string[] {
  const repo = r.repo;
  const risks: string[] = [];
  const usd = (r.reward.amountMinor ?? 0) / 100;

  // Works without repo metadata: one repo spraying large advertised totals across many issues.
  if (ctx && ctx.advertisedUsd >= 20_000 && ctx.issueCount >= 5 && (!repo || repo.stars < 500)) {
    risks.push(`Repo advertises $${Math.round(ctx.advertisedUsd).toLocaleString()} across ${ctx.issueCount} open bounties`);
  }
  if (ctx?.crossPostedRepos && ctx.crossPostedRepos > 1) {
    risks.push(`Same bounty text cross-posted in ${ctx.crossPostedRepos} different repos (spam pattern)`);
  }
  const ended = ENDED_PROGRAMS[r.source.repository.toLowerCase()];
  if (ended) risks.push(`Bounty program ended (${ended.since}): ${ended.reason}`);
  if (r.signals.locked) risks.push("Issue is locked: new attempts can't be posted");
  const issueAgeDays = (now - Date.parse(r.signals.issueCreatedAt)) / DAY;
  if (issueAgeDays > 365) risks.push(`Unsolved for ${(issueAgeDays / 365).toFixed(1)} years: usually harder than it looks`);
  if (r.signals.comments > 80) risks.push(`Heavily contested: ${r.signals.comments} comments on the issue`);
  const prs = r.signals.linkedPRs;
  if (prs?.merged) risks.push(`${prs.merged} linked PR(s) already merged: likely solved or awarded`);
  if (prs && prs.open >= 3) risks.push(`${prs.open} open competing PRs`);
  if (!repo) return risks;

  const ageDays = (now - Date.parse(repo.createdAt)) / DAY;
  // Algora-backed repos naturally attract forks from bounty hunters, so the ratio isn't a farm signal there.
  if (r.reward.platform !== "algora" && repo.stars < 100 && repo.forks >= 3 * Math.max(repo.stars, 1)) {
    risks.push(`Forks far exceed stars (${repo.forks} forks / ${repo.stars} stars): typical of bounty farms`);
  }
  // Synthetic "bounty board" repos: many open bounties on a repo almost nobody uses.
  if (ctx && ctx.issueCount >= 8 && repo.stars < 100) {
    risks.push(`Bounty board repo: ${ctx.issueCount} open bounties on a ${repo.stars}-star repo (work may have no real users / payout unproven)`);
  }
  if (ageDays < 90) risks.push(`Repository is only ${Math.floor(ageDays)} days old`);
  if (usd >= 1000 && repo.stars < 100) risks.push(`$${usd.toLocaleString()} reward from a repo with ${repo.stars} stars`);
  return risks;
}

/** Deterministic business rules. Never marks anything VERIFIED: funding needs research + a human. */
export function verify(r: OpportunityRecord, now = Date.now()): { checks: Check[]; outcome: Status } {
  const ageDays = Math.floor((now - Date.parse(r.signals.issueUpdatedAt)) / DAY);
  const open = r.signals.state === "open";
  const unassigned = r.signals.assignees.length === 0;
  const fresh = ageDays <= config.staleAfterDays;
  const crowded = r.signals.comments > config.maxCommentsBeforeCrowded;
  const archived = r.repo?.archived === true;

  const checks: Check[] = [
    { id: "open", label: "Issue is open", pass: open, note: r.signals.state },
    {
      id: "unassigned", label: "Nobody assigned", pass: unassigned,
      note: unassigned ? "no assignee" : `assigned to ${r.signals.assignees.join(", ")}`,
    },
    {
      id: "reward", label: "Reward amount advertised", pass: r.reward.amountMinor !== null,
      note: r.reward.evidence ?? "no amount found in labels/title/body",
    },
    {
      id: "funding", label: "Funding confirmed", pass: r.reward.fundingStatus === "CONFIRMED" ? true : null,
      note: "Advertised only. Confirm escrow/terms on the bounty platform before working.",
    },
    {
      id: "repo_trust", label: "Repository looks legitimate",
      pass: archived || r.risks.length > 0 ? false : r.repo === null ? null : true,
      note: archived ? "Repository is archived"
        : r.risks.length ? r.risks.join("; ")
        : r.repo === null ? "Repo metadata unavailable (GitHub rate limit; set GITHUB_TOKEN)"
        : `${r.repo.stars} stars, ${r.repo.forks} forks, created ${r.repo.createdAt.slice(0, 10)}`,
    },
    { id: "fresh", label: `Active in last ${config.staleAfterDays} days`, pass: fresh, note: `last update ${ageDays}d ago` },
    {
      id: "competition", label: "Not crowded", pass: !crowded,
      note: `${r.signals.comments} comments${crowded ? " (likely many attempts already)" : ""}`,
    },
    {
      id: "open_prs", label: "No competing PR merged",
      pass: r.signals.linkedPRs ? r.signals.linkedPRs.merged === 0 : null,
      note: r.signals.linkedPRs
        ? `${r.signals.linkedPRs.open} open · ${r.signals.linkedPRs.merged} merged · ${r.signals.linkedPRs.closed} closed linked PRs`
        : "Not checked (needs GitHub auth)",
    },
  ];

  let outcome: Status = "NEEDS_HUMAN_REVIEW";
  if (!open || !unassigned || archived) outcome = "REJECTED";
  else if (!fresh) outcome = "STALE";
  return { checks, outcome };
}

/** 0–100 ranking score; only meaningful for candidates still under review. Each risk halves it. */
export function score(r: OpportunityRecord, now = Date.now()): number {
  if (r.status === "REJECTED" || r.status === "STALE") return 0;
  const relevance = r.classification?.relevance_score ?? 0.35;
  const usd = r.reward.amountMinor ? r.reward.amountMinor / 100 : 0;
  const rewardFactor = usd > 0 ? Math.min(1, Math.log10(usd) / Math.log10(5000)) : 0;
  const ageDays = (now - Date.parse(r.signals.issueUpdatedAt)) / DAY;
  const freshness = Math.max(0, 1 - ageDays / config.staleAfterDays);
  const competition = Math.max(0, 1 - r.signals.comments / config.maxCommentsBeforeCrowded);
  const base = relevance * 35 + rewardFactor * 35 + freshness * 20 + competition * 10;
  return Math.round(base * Math.pow(0.5, (r.risks ?? []).length));
}
