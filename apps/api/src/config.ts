import path from "node:path";
import dotenv from "dotenv";

/** Repo root (apps/api/src -> ../../..). The root .env is the single config source. */
export const repoRoot = path.resolve(import.meta.dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  // Mutating endpoints exist; stay on loopback unless explicitly overridden.
  host: process.env.API_HOST ?? "127.0.0.1",
  dataDir: path.resolve(repoRoot, process.env.DATA_DIR ?? "data/opportunities"),
  jevUrl: process.env.JEV_SERVICE_URL ?? "http://localhost:8100",
  claudeUrl: process.env.CLAUDE_SERVICE_URL ?? "http://localhost:8200",
  githubToken: process.env.GITHUB_TOKEN || undefined,
  staleAfterDays: Number(process.env.STALE_AFTER_DAYS ?? 60),
  maxCommentsBeforeCrowded: Number(process.env.MAX_COMMENTS ?? 25),
};
