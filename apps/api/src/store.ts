import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { OpportunityRecord } from "./types.js";

// Local JSON store (data/ is gitignored). Firestore (see firestore.ts) replaces this once configured.
const file = path.join(config.dataDir, "opportunities.json");
let cache: Map<string, OpportunityRecord> | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Map<string, OpportunityRecord>> {
  if (cache) return cache;
  try {
    const rows = JSON.parse(await readFile(file, "utf8")) as OpportunityRecord[];
    cache = new Map(rows.map((r) => [r.id, r]));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    cache = new Map();
  }
  return cache;
}

function persist(map: Map<string, OpportunityRecord>): Promise<void> {
  // Serialise writes; write-then-rename so a crash never leaves a half-written file.
  writeChain = writeChain.then(async () => {
    await mkdir(config.dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify([...map.values()], null, 2));
    await rename(tmp, file);
  });
  return writeChain;
}

export async function listOpportunities(): Promise<OpportunityRecord[]> {
  return [...(await load()).values()];
}

export async function getOpportunity(id: string): Promise<OpportunityRecord | undefined> {
  return (await load()).get(id);
}

export async function saveOpportunities(records: OpportunityRecord[]): Promise<void> {
  const map = await load();
  for (const r of records) map.set(r.id, r);
  await persist(map);
}
