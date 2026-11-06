import { config } from "../config.js";

/** Search queries for publicly advertised GitHub issue bounties. */
export const QUERIES = [
  'is:issue state:open label:"💎 Bounty"',
  "is:issue state:open label:bounty no:assignee",
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

export async function searchIssues(query: string, perPage = 50): Promise<GithubIssue[]> {
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "opportunityos-discovery",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    throw new Error(`GitHub search failed (HTTP ${res.status}${remaining === "0" ? ", rate limited" : ""}) for: ${query}`);
  }
  const data = (await res.json()) as { items: SearchItem[] };
  return data.items
    .filter((i) => !i.pull_request)
    .map((i) => ({
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
      query,
    }));
}

const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k)?(?![\w.])/i;

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
    const m = MONEY.exec(text);
    if (!m) continue;
    let dollars = Number(m[1].replace(/,/g, "")) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0);
    if (m[3]) dollars *= 1000;
    if (dollars <= 0 || dollars > 1_000_000) continue;
    return { amountMinor: Math.round(dollars * 100), evidence: `${where}: "${m[0].trim()}"` };
  }
  return { amountMinor: null, evidence: null };
}
