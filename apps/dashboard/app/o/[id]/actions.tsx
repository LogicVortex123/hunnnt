"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function Actions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function call(kind: string, path: string, body?: object) {
    setBusy(kind);
    setMsg(null);
    try {
      const r = await fetch(`/api/v1/opportunities/${encodeURIComponent(id)}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json();
      if (!r.ok) setMsg(j.research?.error ?? j.error ?? `HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="actions">
      <button onClick={() => call("research", "research")} disabled={!!busy}>
        {busy === "research" ? "Researching…" : "Research with Claude"}
      </button>
      {status !== "SELECTED" && (
        <button className="primary" onClick={() => call("select", "decision", { decision: "select" })} disabled={!!busy}>
          Select for work
        </button>
      )}
      {status !== "REJECTED" && (
        <button className="ghost" onClick={() => call("reject", "decision", { decision: "reject" })} disabled={!!busy}>Reject</button>
      )}
      {(status === "SELECTED" || status === "REJECTED") && (
        <button className="ghost" onClick={() => call("reset", "decision", { decision: "reset" })} disabled={!!busy}>Back to candidates</button>
      )}
      <p className="muted small">
        Selecting is recorded locally only. Nothing is claimed or posted on GitHub.
      </p>
      {msg && <p className="bad-text small">{msg}</p>}
    </div>
  );
}
