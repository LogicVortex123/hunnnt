// Shared types + server-side fetch helpers (mirror apps/api/src/types.ts).
export const API_URL = process.env.OPPORTUNITYOS_API_URL ?? "http://127.0.0.1:4000";

export interface Check { id: string; label: string; pass: boolean | null; note: string }
export interface AuditEvent { at: string; action: string; actor: string; note?: string }

export interface Opportunity {
  id: string;
  title: string;
  description?: string;
  source: { platform: string; url: string; repository: string; issueNumber: number; labels: string[]; query: string };
  reward: { amountMinor: number | null; currency: string | null; fundingStatus: string; evidence: string | null };
  signals: { state: string; assignees: string[]; comments: number; issueCreatedAt: string; issueUpdatedAt: string };
  repo: { stars: number; forks: number; createdAt: string; archived: boolean } | null;
  risks: string[];
  classification: {
    category: string; technologies: string[]; difficulty: string;
    relevance_score: number; priority: string; confidence: number; note: string;
  } | null;
  verification: { checks: Check[]; verifiedAt: string };
  score: number;
  research?: { status: string; at: string; output?: string; error?: string } | null;
  status: string;
  audit: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export const SERVICES = [
  { id: "api", name: "API", url: API_URL },
  { id: "jev", name: "JEV classifier", url: process.env.JEV_SERVICE_URL ?? "http://127.0.0.1:8100" },
  { id: "claude", name: "Claude adapter", url: process.env.CLAUDE_SERVICE_URL ?? "http://127.0.0.1:8200" },
] as const;

export async function serviceHealth() {
  return Promise.all(
    SERVICES.map(async (s) => {
      try {
        const r = await fetch(`${s.url}/health`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
        return { ...s, online: r.ok };
      } catch {
        return { ...s, online: false };
      }
    }),
  );
}

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export function money(o: Pick<Opportunity, "reward">): string {
  if (o.reward.amountMinor === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: o.reward.currency ?? "USD", maximumFractionDigits: 0 })
    .format(o.reward.amountMinor / 100);
}

export function ago(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}

export const STATUS_LABEL: Record<string, string> = {
  NEEDS_HUMAN_REVIEW: "Candidate",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  STALE: "Stale",
  DISCOVERED: "Discovered",
};
