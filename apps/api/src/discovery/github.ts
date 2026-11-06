import { config } from "../config.js";

export interface Query {
  q: string;
  pages: number;
  /** Bounties created through Algora: the amount lives in the algora-pbc bot comment. */
  algora?: boolean;
}

/** Search queries for publicly advertised GitHub issue bounties, most credible first. */
export const QUERIES: Query[] = [
  { q: "is:issue state:open commenter:app/algora-pbc no:assignee", pages: 3, algora: true },
  { q: 'is:issue state:open label:"💎 Bounty" no:assignee', pages: 1, algora: true },
  { q: "is:issue state:open label:bounty no:assignee", pages: 1 },
];

export interface GithubIssue {
  repository: string;
  number: number;
  url: string;
  title: string;
  body: string;
  labels: string[];
  state: string;
  assignees: string[];
  comments: number;
  createdAt: string;
  updatedAt: string;
  query: string;
  algora: boolean;
}

interface SearchItem {
  html_url: string;
  repository_url: string;
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name?: string } | string>;
  state: string;
  assignees?: Array<{ login: string }> | null;
  comments: number;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "opportunityos-discovery",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (config.githubToken) h.Authorization = `Bearer ${config.githubToken}`;
  return h;
}

/** GET only: this service never writes to GitHub. */
export async function ghGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers(), signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const limited = res.headers.get("x-ratelimit-remaining") === "0";
    throw new Error(`GitHub GET ${path.split("?")[0]} failed (HTTP ${res.status}${limited ? ", rate limited" : ""})`);
  }
  return (await res.json()) as T;
}

export async function searchIssues(query: Query): Promise<GithubIssue[]> {
  const out: GithubIssue[] = [];
  for (let page = 1; page <= query.pages; page++) {
    const data = await ghGet<{ items: SearchItem[] }>(
      `/search/issues?q=${encodeURIComponent(query.q)}&sort=updated&order=desc&per_page=100&page=${page}`,
    );
    for (const i of data.items) {
      if (i.pull_request) continue;
      out.push({
        repository: i.repository_url.replace("https://api.github.com/repos/", ""),
        number: i.number,
        url: i.html_url,
        title: i.title,
        // Untrusted text: stored as data only, truncated, never executed or followed.
        body: (i.body ?? "").slice(0, 6000),
        labels: i.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean),
        state: i.state,
        assignees: (i.assignees ?? []).map((a) => a.login),
        comments: i.comments,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
        query: query.q,
        algora: Boolean(query.algora),
      });
    }
    if (data.items.length < 100) break;
  }
  return out;
}

const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k)?(?![\w.])/i;

function money(text: string): { cents: number; raw: string } | null {
  const m = MONEY.exec(text);
  if (!m) return null;
  let dollars = Number(m[1].replace(/,/g, "")) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0);
  if (m[3]) dollars *= 1000;
  if (dollars <= 0 || dollars > 1_000_000) return null;
  return { cents: Math.round(dollars * 100), raw: m[0].trim() };
}

/** Extract an *advertised* USD amount. This is never evidence of funding. */
export function parseReward(issue: Pick<GithubIssue, "labels" | "title" | "body">): {
  amountMinor: number | null;
  evidence: string | null;
} {
  const sources: Array<[string, string]> = [
    ...issue.labels.map((l): [string, string] => ["label", l]),
    ["title", issue.title],
    ["body", issue.body.slice(0, 3000)],
  ];
  for (const [where, text] of sources) {
    const m = money(text);
    if (m) return { amountMinor: m.cents, evidence: `${where}: "${m.raw}"` };
  }
  return { amountMinor: null, evidence: null };
}

/** Read the bounty amount from Algora's bot comment ("## 💎 $500 bounty • org"). */
export async function algoraReward(repo: string, n: number): Promise<{ amountMinor: number; evidence: string } | null> {
  const comments = await ghGet<Array<{ user: { login: string } | null; body: string; html_url: string }>>(
    `/repos/${repo}/issues/${n}/comments?per_page=50`,
  );
  for (const c of comments) {
    if (c.user?.login !== "algora-pbc[bot]") continue;
    const m = /💎\s*(\$[\d,.]+k?)\s*bounty/i.exec(c.body) ?? /(\$[\d,.]+k?)\s*bounty/i.exec(c.body);
    const parsed = m ? money(m[1]) : null;
    if (parsed) return { amountMinor: parsed.cents, evidence: `algora-pbc[bot]: "${m![0].trim()}" (${c.html_url})` };
  }
  return null;
}

/** Pull requests that cross-reference the issue (competing attempts / already solved). */
export async function linkedPullRequests(repo: string, n: number): Promise<{ open: number; merged: number; closed: number }> {
  const events = await ghGet<Array<{
    event: string;
    source?: { issue?: { state: string; pull_request?: { merged_at: string | null } } };
  }>>(`/repos/${repo}/issues/${n}/timeline?per_page=100`);
  const prs = events.filter((e) => e.event === "cross-referenced" && e.source?.issue?.pull_request);
  const merged = prs.filter((e) => e.source!.issue!.pull_request!.merged_at).length;
  const open = prs.filter((e) => e.source!.issue!.state === "open").length;
  return { open, merged, closed: prs.length - open - merged };
}
