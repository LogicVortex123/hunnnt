import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { RepoInfo } from "../types.js";

// Repo metadata cache (24h TTL) so discovery doesn't burn the GitHub core rate limit (60/h unauthenticated).
const TTL_MS = 24 * 3_600_000;
const file = path.join(config.dataDir, "repos.json");
let cache: Record<string, RepoInfo> | null = null;

async function load(): Promise<Record<string, RepoInfo>> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(file, "utf8")) as Record<string, RepoInfo>;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(cache, null, 2));
  await rename(`${file}.tmp`, file);
}

async function fetchRepo(fullName: string): Promise<RepoInfo | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "opportunityos-discovery",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const r = (await res.json()) as {
      stargazers_count: number; forks_count: number; created_at: string; pushed_at: string;
      archived: boolean; owner: { type: string };
    };
    return {
      stars: r.stargazers_count,
      forks: r.forks_count,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      archived: r.archived,
      ownerType: r.owner.type,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Returns metadata for each repo (null when unavailable, e.g. rate limited). */
export async function getRepos(names: string[]): Promise<Map<string, RepoInfo | null>> {
  const c = await load();
  const out = new Map<string, RepoInfo | null>();
  let dirty = false;
  for (const name of names) {
    const key = name.toLowerCase();
    const hit = c[key];
    if (hit && Date.now() - Date.parse(hit.fetchedAt) < TTL_MS) {
      out.set(name, hit);
      continue;
    }
    const fresh = await fetchRepo(name);
    if (fresh) {
      c[key] = fresh;
      dirty = true;
    }
    out.set(name, fresh ?? hit ?? null);
  }
  if (dirty) await persist();
  return out;
}
