import { apiGet, serviceHealth, type Opportunity } from "@/lib/api";
import { Board } from "./board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [health, rows] = await Promise.all([serviceHealth(), apiGet<Opportunity[]>("/api/v1/opportunities")]);

  return (
    <>
      <section className="services">
        {health.map((s) => (
          <div key={s.id} className="svc">
            <span className={`dot ${s.online ? "ok" : "bad"}`} aria-hidden />
            <span>{s.name}</span>
            <span className="muted small">{s.online ? "online" : "offline"}</span>
          </div>
        ))}
      </section>

      {rows === null ? (
        <div className="empty">
          <h2>API is offline</h2>
          <p className="muted">Start it with <code>corepack pnpm dev:local</code> from the repo root.</p>
        </div>
      ) : (
        <Board rows={rows} />
      )}
    </>
  );
}
