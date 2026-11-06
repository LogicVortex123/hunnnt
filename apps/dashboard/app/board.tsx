"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ago, effortLabel, money, REC_LABEL, STATUS_LABEL, type Opportunity } from "@/lib/api";

const TABS = [
  { id: "NEEDS_HUMAN_REVIEW", label: "Candidates" },
  { id: "SELECTED", label: "Selected" },
  { id: "STALE", label: "Stale" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All" },
] as const;

interface RunResult { fetched: number; created: number; updated: number; errors: string[] }

export function Board({ rows }: { rows: Opportunity[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("NEEDS_HUMAN_REVIEW");
  const [rewardOnly, setRewardOnly] = useState(true);
  const [hideRisky, setHideRisky] = useState(true);
  const [quickOnly, setQuickOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      (tab === "ALL" || r.status === tab) &&
      (!rewardOnly || r.reward.amountMinor !== null) &&
      (!hideRisky || !(r.risks?.length)) &&
      (!quickOnly || r.classification?.effort?.doable_in_two_days === true) &&
      (!q || r.title.toLowerCase().includes(q) || r.source.repository.toLowerCase().includes(q) ||
        (r.classification?.category ?? "").includes(q)),
    );
  }, [rows, tab, rewardOnly, hideRisky, quickOnly, query]);

  async function runDiscovery() {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/discovery/run", { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setResult(body);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <div className="toolbar">
        <div>
          <h1>Bounties</h1>
          <p className="muted small">
            GitHub issues advertising a bounty, run through JEV classification and fixed checks. Amounts are
            <strong> advertised, not confirmed</strong>.
          </p>
        </div>
        <button className="primary" onClick={runDiscovery} disabled={running}>
          {running ? "Searching GitHub…" : "Find bounties"}
        </button>
      </div>

      {result && (
        <p className="notice">
          Fetched {result.fetched} issues: {result.created} new, {result.updated} refreshed.
          {result.errors.length > 0 && <span className="warn-text"> {result.errors.join("; ")}</span>}
        </p>
      )}
      {error && <p className="notice bad-text">{error}</p>}

      <div className="filters">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "tab on" : "tab"} onClick={() => setTab(t.id)}>
              {t.label} <span className="count">{counts[t.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="row gap">
          <input className="search" placeholder="Filter by title, repo, category" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="small row gap-s">
            <input type="checkbox" checked={rewardOnly} onChange={(e) => setRewardOnly(e.target.checked)} /> Has amount
          </label>
          <label className="small row gap-s">
            <input type="checkbox" checked={quickOnly} onChange={(e) => setQuickOnly(e.target.checked)} /> Doable in 1–2 days
          </label>
          <label className="small row gap-s">
            <input type="checkbox" checked={hideRisky} onChange={(e) => setHideRisky(e.target.checked)} /> Hide red flags
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>No bounties yet</h2>
          <p className="muted">Press <strong>Find bounties</strong> to search GitHub.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty"><p className="muted">Nothing matches these filters.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Score</th>
                <th>Bounty</th>
                <th className="num">Reward</th>
                <th>Category</th>
                <th>Effort (JEV)</th>
                <th className="num">Comments</th>
                <th>Updated</th>
                <th>Research</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="num"><span className="score">{r.score}</span></td>
                  <td>
                    <Link href={`/o/${r.id}`} className="title">{r.title}</Link>
                    <div className="muted small mono">{r.source.repository}#{r.source.issueNumber}</div>
                    {r.risks?.length > 0 && <div className="warn-text small">⚠ {r.risks[0]}</div>}
                  </td>
                  <td className="num">{money(r)}</td>
                  <td>{r.classification?.category ?? "—"}</td>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>{effortLabel(r)}</td>
                  <td className="num">{r.signals.comments}</td>
                  <td className="small">{ago(r.signals.issueUpdatedAt)}</td>
                  <td>{r.researchRecommendation ? <span className={`badge r-${r.researchRecommendation}`}>{REC_LABEL[r.researchRecommendation]}</span> : <span className="muted small">—</span>}</td>
                  <td><span className={`badge s-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
