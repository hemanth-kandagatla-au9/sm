/**
 * /dev/transport — the Step 12 review surface.
 *
 * Drives the real transport against the scripted backend at /api/agent/mock.
 * `HttpAgent`, the SSE parser and every subscriber path are the production ones;
 * only the graph is scripted. Switch to "Real backend" once agui_server.py is up
 * and the same page talks to Python instead.
 */
"use client";

import { useState } from "react";
import { AgentComponentHost } from "@/agent-ui/AgentComponentHost";
import { useAgentSession } from "@/agent-ui/useAgentSession";
import { cn } from "@/lib/cn";

const TARGETS = [
  { label: "Mock — full flow", url: "/api/agent/mock?scenario=flow" },
  { label: "Mock — reconnect (no snapshot)", url: "/api/agent/mock?scenario=reconnect" },
  { label: "Mock — state delta only", url: "/api/agent/mock?scenario=delta" },
  { label: "Mock — streamed text first", url: "/api/agent/mock?scenario=text" },
  { label: "Mock — run error", url: "/api/agent/mock?scenario=error" },
  { label: "Real backend (:8084)", url: "/api/agent" },
] as const;

const STATUS_TONE: Record<string, string> = {
  idle: "bg-surface-muted text-ink-600",
  running: "bg-chip-blue text-ink-800",
  waiting: "bg-chip-amber text-ink-800",
  finished: "bg-chip-green text-ink-800",
  error: "bg-brand text-white",
};

export default function TransportPage() {
  const [target, setTarget] = useState<string>(TARGETS[0].url);
  const [log, setLog] = useState<string[]>([]);

  // Remounting on target change is deliberate — a session is bound to one
  // endpoint and one thread.
  return (
    <main className="min-h-screen bg-linear-to-t from-canvas-from to-canvas-to px-10 py-12">
      <header className="mb-8">
        <h1 className="text-64 font-display font-bold text-ink-900">
          Agent{" "}
          <span className="bg-linear-to-bl from-brand-grad-from to-brand-grad-to bg-clip-text text-transparent">
            transport
          </span>
        </h1>
        <p className="mt-4 text-24 font-text leading-normal tracking-normal text-ink-500">
          Real <code className="font-mono text-16">@ag-ui/client</code> over real AG-UI SSE. Only
          the graph is scripted.
        </p>
      </header>

      <div className="mb-8 flex flex-wrap gap-2">
        {TARGETS.map((t) => (
          <button
            key={t.url}
            type="button"
            onClick={() => {
              setTarget(t.url);
              setLog([]);
            }}
            className={cn(
              "rounded-md border px-3 py-2 text-12 font-text font-medium transition-colors",
              target === t.url
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-ink-600",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Session key={target} url={target} log={log} setLog={setLog} />
    </main>
  );
}

function Session({
  url,
  log,
  setLog,
}: {
  url: string;
  log: string[];
  setLog: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const session = useAgentSession({ url });
  const { resolution, status } = session;

  function respond(value: string) {
    setLog((l) => [...l, `→ resume: ${JSON.stringify(value)}`]);
    session.respond(value);
  }

  return (
    <>
      <section className="mb-8 rounded-xl border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn("rounded-chip px-3 py-1 text-12 font-text font-medium", STATUS_TONE[status])}
          >
            {status}
          </span>
          <span className="text-12 font-text text-ink-400">thread {session.threadId}</span>
          <span className="text-12 font-text text-ink-400">
            rendering{" "}
            <strong className="text-ink-900">
              {resolution.status === "ok" ? resolution.name : resolution.status}
            </strong>
            {resolution.status === "ok" ? ` from ${resolution.source}` : ""}
          </span>

          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={session.start}
              disabled={status !== "idle"}
              className="rounded-md bg-linear-to-r from-btn-from to-btn-to px-4 py-2 text-12 font-text font-medium text-white disabled:bg-none disabled:bg-disabled"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => {
                session.reset();
                setLog([]);
              }}
              className="rounded-md border border-line bg-surface px-4 py-2 text-12 font-text font-medium text-ink-600"
            >
              Reset
            </button>
          </span>
        </div>

        {session.error ? (
          <p className="mt-4 text-12 font-text text-error">{session.error}</p>
        ) : null}

        {resolution.status === "ok" && resolution.source === "interrupt" ? (
          <p className="mt-4 text-12 font-text text-ink-500">
            Rendered from the <strong>interrupt</strong>. On the reconnect scenario no state
            snapshot is sent at all — if this still shows a card, D7&rsquo;s precedence rule is
            working.
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <AgentComponentHost resolution={resolution} respond={respond} />
      </section>

      {log.length ? (
        <section className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-3 text-12 font-text font-medium uppercase text-ink-400">Resumes sent</p>
          <pre className="max-h-48 overflow-auto text-10 font-mono text-ink-600">
            {log.join("\n")}
          </pre>
        </section>
      ) : null}
    </>
  );
}
