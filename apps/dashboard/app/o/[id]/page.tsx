import Link from "next/link";
import { notFound } from "next/navigation";
import { ago, apiGet, money, STATUS_LABEL, type Opportunity } from "@/lib/api";
import { Actions } from "./actions";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await apiGet<Opportunity>(`/api/v1/opportunities/${encodeURIComponent(id)}`);
  if (!o) notFound();

  return (
    <article className="detail">
      <Link href="/" className="muted small">← All bounties</Link>
      <div className="detail-head">
        <div>
          <h1>{o.title}</h1>
          <p className="mono small">
            <a href={o.source.url} target="_blank" rel="noreferrer noopener">{o.source.repository}#{o.source.issueNumber} ↗</a>
          </p>
        </div>
        <div className="stat-row">
          <div className="stat"><span className="muted small">Score</span><strong>{o.score}</strong></div>
          <div className="stat"><span className="muted small">Reward</span><strong>{money(o)}</strong><span className="small muted">{o.reward.fundingStatus.toLowerCase()}</span></div>
          <div className="stat"><span className="muted small">Status</span><span className={`badge s-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span></div>
        </div>
      </div>

      <Actions id={o.id} status={o.status} />

      <div className="cols">
        <section className="panel">
          <h2>Checks</h2>
          <ul className="checks">
            {o.verification.checks.map((c) => (
              <li key={c.id}>
                <span className={`mark ${c.pass === true ? "ok" : c.pass === false ? "bad" : "unk"}`}>
                  {c.pass === true ? "✓" : c.pass === false ? "✗" : "?"}
                </span>
                <div><div>{c.label}</div><div className="muted small">{c.note}</div></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Classification (JEV)</h2>
          {o.classification ? (
            <dl className="kv">
              <dt>Category</dt><dd>{o.classification.category}</dd>
              <dt>Difficulty</dt><dd>{o.classification.difficulty}</dd>
              <dt>Relevance</dt><dd>{o.classification.relevance_score}</dd>
              <dt>Priority</dt><dd>{o.classification.priority}</dd>
              <dt>Labels</dt><dd>{o.source.labels.join(", ") || "—"}</dd>
              <dt>Activity</dt><dd>{o.signals.comments} comments · updated {ago(o.signals.issueUpdatedAt)}</dd>
            </dl>
          ) : <p className="muted">JEV was unreachable during discovery.</p>}
          <p className="muted small">{o.classification?.note}</p>
        </section>
      </div>

      <section className="panel">
        <h2>Research (Claude)</h2>
        {!o.research ? (
          <p className="muted">Not researched yet.</p>
        ) : o.research.status === "completed" ? (
          <pre className="pre">{o.research.output}</pre>
        ) : (
          <p className="bad-text">Failed: {o.research.error}</p>
        )}
      </section>

      <section className="panel">
        <h2>Issue text <span className="muted small">(untrusted, shown as plain text)</span></h2>
        <pre className="pre">{o.description || "(empty)"}</pre>
      </section>

      <section className="panel">
        <h2>Audit trail</h2>
        <ul className="audit">
          {o.audit.slice().reverse().map((a, i) => (
            <li key={i} className="small"><span className="mono muted">{new Date(a.at).toLocaleString()}</span> {a.action} <span className="muted">· {a.actor}{a.note ? ` · ${a.note}` : ""}</span></li>
          ))}
        </ul>
      </section>
    </article>
  );
}
