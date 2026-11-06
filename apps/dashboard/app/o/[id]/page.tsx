import Link from "next/link";
import { notFound } from "next/navigation";
import { ago, apiGet, effortLabel, money, STATUS_LABEL, type Opportunity } from "@/lib/api";
import { Actions } from "./actions";
import type { ResearchReport } from "@/lib/api";
import { REC_LABEL } from "@/lib/api";

function List({ items }: { items: string[] }) {
  return items.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="muted small">none</span>;
}

function Report({ r, agent, at }: { r: ResearchReport; agent?: string; at: string }) {
  return (
    <div className="report">
      <p>
        <span className={`badge r-${r.recommendation}`}>{REC_LABEL[r.recommendation]}</span>{" "}
        <span>{r.recommendationReason}</span>
      </p>
      <p className="small">{r.summary}</p>
      <dl className="kv">
        <dt>Funding</dt><dd>{r.reward.fundingStatus}{r.reward.amountUsd !== null ? ` · $${r.reward.amountUsd}` : ""}{r.reward.platform ? ` · ${r.reward.platform}` : ""}</dd>
        <dt>Effort</dt><dd>~{r.effort.hours}h · {r.effort.doableInTwoDays ? "doable in 2 days" : "more than 2 days"}<div className="muted small">{r.effort.reasoning}</div></dd>
        <dt>Competition</dt><dd>{r.competition.openPRs} open PRs · {r.competition.mergedPRs} merged · {r.competition.activeClaimants} active claimants<div className="muted small">{r.competition.notes}</div></dd>
        <dt>Maintainers</dt><dd className="small">{r.maintainerActivity}</dd>
        <dt>Eligibility</dt><dd>{r.eligibilityStatus}</dd>
        <dt>Deadline</dt><dd>{r.deadline ?? "none stated"}</dd>
        <dt>Submit via</dt><dd className="small">{r.submissionMethod ?? "unknown"}</dd>
        <dt>Acceptance</dt><dd><List items={r.acceptanceCriteria} /></dd>
        <dt>Risks</dt><dd><List items={r.risks} /></dd>
        <dt>Unknowns</dt><dd><List items={r.unknowns} /></dd>
        <dt>Evidence</dt>
        <dd>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {r.evidence.map((e, i) => (
              <li key={i}>{e.claim} <a href={e.url} target="_blank" rel="noreferrer noopener">↗</a></li>
            ))}
          </ul>
        </dd>
      </dl>
      <p className="muted small">by {agent ?? "unknown agent"} · {new Date(at).toLocaleString()}</p>
    </div>
  );
}

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

      <Actions
        id={o.id}
        status={o.status}
        queued={Boolean(o.researchRequestedAt && !(o.research?.report && o.research.at >= o.researchRequestedAt))}
      />

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
              <dt>Effort</dt>
              <dd>
                {effortLabel(o)}
                {o.classification.effort && (
                  <ul className="small muted" style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                    {o.classification.effort.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </dd>
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
        {!o.research || (o.research.status === "failed" && /ANTHROPIC_API_KEY/.test(o.research.error ?? "")) ? (
          <p className="muted">Not researched yet. Ask Claude Code: <code>research bounty {o.id}</code></p>
        ) : o.research.report ? (
          <Report r={o.research.report} agent={o.research.agent} at={o.research.at} />
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
