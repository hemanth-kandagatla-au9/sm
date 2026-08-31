"use client";

import { useState } from "react";
import { useAgentSession } from "@/agent-ui/useAgentSession";
import { Transcript } from "@/shell/Transcript";

/**
 * /dev/session — the whole loop, against the scripted backend.
 *
 * This is not the designed shell; that arrives in Step 8. It exists to drive the
 * transport and the transcript through every scenario the real backend can
 * produce, including the ones that are hard to reach on purpose:
 *
 *   flow       the CR/CO conversation, advancing on each answer
 *   reconnect  a pending interrupt re-delivered with NO state snapshot
 *   delta      the card arrives only as a JSON Patch on the state channel
 *   text       an assistant message streams before the card
 *   error      RUN_ERROR mid-run
 */
const SCENARIOS = ["flow", "reconnect", "delta", "text", "error"] as const;

export function Session() {
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]>("flow");
  const session = useAgentSession({ url: `/api/agent/mock?scenario=${scenario}` });

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <h1 className="font-display text-16 font-medium text-ink-900">Session</h1>

        <select
          value={scenario}
          onChange={(e) => setScenario(e.target.value as (typeof SCENARIOS)[number])}
          className="rounded-sm border border-line px-2 py-1 text-12 text-ink-800"
        >
          {SCENARIOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={session.start}
          className="rounded-md bg-btn-primary px-3 py-1.5 text-12 text-white"
        >
          Start
        </button>
        <button
          type="button"
          onClick={session.reset}
          className="rounded-md border border-line px-3 py-1.5 text-12 text-ink-800"
        >
          Reset
        </button>

        <span className="ml-auto flex items-center gap-3 text-12 text-ink-500">
          <span>
            status <b className="text-ink-900">{session.status}</b>
          </span>
          <span>
            turns <b className="text-ink-900">{session.turns.length}</b>
          </span>
          <span className="max-w-[14rem] truncate">{session.threadId || "…"}</span>
        </span>
      </header>

      {session.error && (
        <p role="alert" className="shrink-0 border-b border-error bg-danger-soft-bg px-6 py-2 text-12 text-error">
          {session.error}
        </p>
      )}

      <div className="min-h-0 flex-1 bg-linear-to-b from-canvas-from to-canvas-to">
        {session.turns.length === 0 ? (
          <p className="p-8 text-14 text-ink-500">
            {session.hydrated
              ? "No turns yet. Press Start."
              : "Reading the stored transcript…"}
          </p>
        ) : (
          <Transcript
            turns={session.turns}
            respond={session.respond}
            userName="Kelvin Johnson"
            busy={session.status === "running"}
          />
        )}
      </div>
    </div>
  );
}
