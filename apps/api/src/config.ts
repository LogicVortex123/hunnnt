import { execFileSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

/** Repo root (apps/api/src -> ../../..). The root .env is the single config source. */
export const repoRoot = path.resolve(import.meta.dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

/**
 * GitHub token for read-only API calls: GITHUB_TOKEN, else (if GITHUB_TOKEN_FROM_GH=true) the local
 * `gh` CLI login. Held in memory only, never logged or written; the API only issues GET requests to GitHub.
 */
function resolveGithubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GITHUB_TOKEN_FROM_GH !== "true") return undefined;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 5000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  // Mutating endpoints exist; stay on loopback unless explicitly overridden.
  host: process.env.API_HOST ?? "127.0.0.1",
  dataDir: path.resolve(repoRoot, process.env.DATA_DIR ?? "data/opportunities"),
  jevUrl: process.env.JEV_SERVICE_URL ?? "http://localhost:8100",
  claudeUrl: process.env.CLAUDE_SERVICE_URL ?? "http://localhost:8200",
  githubToken: resolveGithubToken(),
  staleAfterDays: Number(process.env.STALE_AFTER_DAYS ?? 60),
  maxCommentsBeforeCrowded: Number(process.env.MAX_COMMENTS ?? 25),
};
