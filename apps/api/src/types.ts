import type { OpportunityStatus } from "@opportunityos/schemas/opportunity";

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
  };
  signals: {
    state: string;
    assignees: string[];
    comments: number;
    issueCreatedAt: string;
    issueUpdatedAt: string;
  };
  repo: RepoInfo | null;
  /** Human-readable red flags from deterministic trust rules (bounty farms, implausible rewards…). */
  risks: string[];
  classification: Classification | null;
  verification: { checks: Check[]; verifiedAt: string };
  score: number;
  research: { status: "completed" | "failed"; at: string; output?: string; error?: string } | null;
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
