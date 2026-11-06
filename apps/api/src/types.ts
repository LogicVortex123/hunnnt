import type { OpportunityStatus } from "@opportunityos/schemas/opportunity";
import type { ResearchReport } from "@opportunityos/schemas/research";

export type { ResearchReport };

export type Status = (typeof OpportunityStatus.options)[number];
export type FundingStatus = "CONFIRMED" | "ADVERTISED" | "UNKNOWN" | "NOT_FUNDED";

export interface Check {
  id: string;
  label: string;
  /** true = pass, false = fail, null = unknown / needs a human */
  pass: boolean | null;
  note: string;
}

export interface AuditEvent {
  at: string;
  action: string;
  actor: string;
  note?: string;
}

export interface Classification {
  category: string;
  technologies: string[];
  difficulty: "easy" | "medium" | "hard" | "unknown";
  relevance_score: number;
  priority: "low" | "medium" | "high";
  confidence: number;
  effort?: {
    hours: number;
    bucket: "under_1_day" | "1_2_days" | "multi_day";
    doable_in_two_days: boolean;
    confidence: number;
    reasons: string[];
  };
  note: string;
}

export interface RepoInfo {
  stars: number;
  forks: number;
  createdAt: string;
  pushedAt: string;
  archived: boolean;
  ownerType: string;
  fetchedAt: string;
}

export interface OpportunityRecord {
  schemaVersion: "1.0";
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  source: {
    platform: "github";
    url: string;
    repository: string;
    issueNumber: number;
    labels: string[];
    query: string;
  };
  reward: {
    amountMinor: number | null;
    currency: string | null;
    fundingStatus: FundingStatus;
    /** Where the advertised amount was read from (label / title / body). */
    evidence: string | null;
    platform?: "algora" | null;
  };
  signals: {
    state: string;
    assignees: string[];
    comments: number;
    issueCreatedAt: string;
    issueUpdatedAt: string;
    /** PRs cross-referencing the issue; null when not fetched. */
    linkedPRs?: { open: number; merged: number; closed: number } | null;
  };
  repo: RepoInfo | null;
  /** Human-readable red flags from deterministic trust rules (bounty farms, implausible rewards…). */
  risks: string[];
  classification: Classification | null;
  verification: { checks: Check[]; verifiedAt: string };
  score: number;
  research: {
    status: "completed" | "failed";
    at: string;
    /** "claude-adapter" (API key) or "claude-code" (this repo's lead agent / its subagents). */
    agent?: string;
    output?: string;
    report?: ResearchReport;
    error?: string;
  } | null;
  /** Set when the user requests research; cleared implicitly by a newer report. */
  researchRequestedAt?: string;
  status: Status;
  audit: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}

/** Statuses owned by a human decision or active work; discovery must never overwrite them. */
export const HUMAN_OWNED: ReadonlySet<Status> = new Set<Status>([
  "SELECTED", "IN_PROGRESS", "IN_REVIEW", "READY_FOR_APPROVAL", "SUBMITTED",
  "CHANGES_REQUESTED", "ACCEPTED", "PAYMENT_PENDING", "PAID", "CLOSED", "VERIFIED",
]);
