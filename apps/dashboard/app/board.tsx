"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ago, effortLabel, money, REC_LABEL, STATUS_LABEL, type Opportunity } from "@/lib/api";

const TABS = [
  { id: "ALL", label: "All" },
  { id: "NEEDS_HUMAN_REVIEW", label: "Candidates" },
  { id: "SELECTED", label: "Selected" },
  { id: "STALE", label: "Stale" },
  { id: "REJECTED", label: "Rejected" },
] as const;

interface RunResult { fetched: number; created: number; updated: number; errors: string[] }

export function Board({ rows }: { rows: Opportunity[] }) {
  const router = useRouter();
  // Everything visible by default; filters are opt-in so nothing is silently hidden.
  const [tab, setTab] = useState<string>("ALL");
  const [rewardOnly, setRewardOnly] = useState(false);
  const [hideRisky, setHideRisky] = useState(false);
  const [quickOnly, setQuickOnly] = useState(false);
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

  // How many rows in the current tab each filter would remove on its own.
  const inTab = useMemo(() => rows.filter((r) => tab === "ALL" || r.status === tab), [rows, tab]);
  const hiddenBy = {
    amount: inTab.filter((r) => r.reward.amountMinor === null).length,
    quick: inTab.filter((r) => r.classification?.effort?.doable_in_two_days !== true).length,
    risky: inTab.filter((r) => r.risks?.length).length,
  };
  const filtersOn = rewardOnly || hideRisky || quickOnly || query.trim() !== "";
  const clearFilters = () => { setRewardOnly(false); setHideRisky(false); setQuickOnly(false); setQuery(""); };

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
            <span className="muted">(−{hiddenBy.amount})</span>
          </label>
          <label className="small row gap-s">
            <input type="checkbox" checked={quickOnly} onChange={(e) => setQuickOnly(e.target.checked)} /> Doable in 1–2 days
            <span className="muted">(−{hiddenBy.quick})</span>
          </label>
          <label className="small row gap-s">
            <input type="checkbox" checked={hideRisky} onChange={(e) => setHideRisky(e.target.checked)} /> Hide red flags
            <span className="muted">(−{hiddenBy.risky})</span>
          </label>
        </div>
      </div>

      {rows.length > 0 && (
        <p className="small muted showing">
          Showing <strong>{visible.length}</strong> of {inTab.length} bounties
          {tab !== "ALL" && <> in this tab ({rows.length} total)</>}
          {filtersOn && visible.length < inTab.length && (
            <> · {inTab.length - visible.length} hidden by filters · <button className="link" onClick={clearFilters}>Clear filters</button></>
          )}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <h2>No bounties yet</h2>
          <p className="muted">Press <strong>Find bounties</strong> to search GitHub.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p className="muted">Nothing matches these filters.</p>
          <button onClick={() => { clearFilters(); setTab("ALL"); }}>Show all {rows.length} bounties</button>
        </div>
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
                    {r.risks?.length > 0 && (
                      <div className="warn-text small" title={r.risks.join("\n")}>
                        ⚠ {r.risks[0]}{r.risks.length > 1 && ` (+${r.risks.length - 1} more)`}
                      </div>
                    )}
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
