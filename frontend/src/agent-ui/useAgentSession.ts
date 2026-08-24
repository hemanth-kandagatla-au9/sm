/**
 * agent-ui/useAgentSession.ts
 *
 * The only file in the app that knows how the agent is reached. Everything below
 * it — `resolveEnvelope`, the registry, the host, all eight cards — takes plain
 * values and would not notice if this were rewritten (DECISIONS.md D8).
 *
 * ── Two things this backend does differently from the AG-UI docs ─────────────
 * Both verified by reading `ag-ui-langgraph==0.0.42`, which is what
 * `agui_server.py` pins. Following the current docs instead would fail silently
 * in both cases.
 *
 * **1. Interrupts arrive as a CUSTOM event named `on_interrupt`.**
 * `RunFinishedEvent` is constructed with no `outcome` field, so
 * `agent.pendingInterrupts` and `onRunFinishedEvent`'s `outcome: "interrupt"`
 * branch never fire against this backend. The envelope is `event.value`.
 *
 * **2. Resume travels in `forwardedProps.command.resume`.**
 * `RunAgentInput.resume` exists in the protocol *and* on `runAgent()`, and
 * `agent.py` never reads it. Sending it is accepted, returns no error, and the
 * graph never wakes up. This is the sharpest trap in the integration.
 *
 * @see DECISIONS.md D24
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HttpAgent } from "@ag-ui/client";
import { resolveEnvelope } from "./resolveEnvelope";
import type { Resolution } from "./types";

/** The custom-event name ag-ui-langgraph uses for LangGraph interrupts. */
const ON_INTERRUPT = "on_interrupt";

export type SessionStatus = "idle" | "running" | "waiting" | "finished" | "error";

export interface AgentSession {
  /** What the host should render right now. */
  resolution: Resolution;
  /** Answer the open interrupt. No-op when nothing is waiting. */
  respond: (value: string) => void;
  status: SessionStatus;
  error: string | null;
  /** Begin the conversation. Safe to call twice; the second is ignored. */
  start: () => void;
  /** Drop all local state and start over on a fresh thread. */
  reset: () => void;
  threadId: string;
}

export interface UseAgentSessionOptions {
  /** Defaults to the same-origin proxy at /api/agent. */
  url?: string;
  /** Start automatically on mount. */
  autoStart?: boolean;
}

export function useAgentSession({
  url = "/api/agent",
  autoStart = false,
}: UseAgentSessionOptions = {}): AgentSession {
  const [threadId, setThreadId] = useState(() => `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * The two render sources, kept separate on purpose. `resolveEnvelope` decides
   * between them; this hook must not pre-empt that decision by collapsing them
   * into one value.
   */
  const [interruptValue, setInterruptValue] = useState<unknown>(null);
  const [stateComponent, setStateComponent] = useState<unknown>(null);

  const agent = useMemo(
    () => new HttpAgent({ url, agentId: "cr-co", threadId }),
    [url, threadId],
  );

  /** True once a run is in flight, so `start` and `respond` cannot overlap. */
  const running = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    const sub = agent.subscribe({
      onCustomEvent({ event }) {
        if (event.name !== ON_INTERRUPT) return;
        // The graph is blocked. `event.value` is the ui_component envelope.
        setInterruptValue(event.value);
        setStatus("waiting");
      },

      /**
       * One handler for both STATE_SNAPSHOT and STATE_DELTA.
       *
       * `onStateChanged` receives the **merged** state, so RFC-6902 deltas are
       * already applied and there is no patching to re-implement here. The
       * per-event hooks are deliberately not used: `onStateDeltaEvent` fires
       * with the patch, and reading `agent.state` from inside it returns the
       * state from *before* the patch is applied — which silently produced no
       * card at all when the agent sent `ui_component` as a delta rather than a
       * snapshot. Caught by the `delta` scenario in the mock.
       *
       * Note the real snapshot is the whole `AgentState` — twenty-odd keys —
       * not just `ui_component`.
       */
      onStateChanged({ state }) {
        const s = state as { ui_component?: unknown } | undefined;
        setStateComponent(s?.ui_component ?? null);
      },

      onRunErrorEvent({ event }) {
        setError(event.message ?? "The agent reported an error.");
        setStatus("error");
      },

      onRunFinishedEvent() {
        // A finished run does *not* mean the conversation ended — this backend
        // finishes the run and leaves the interrupt pending. Only promote to
        // "finished" when nothing is waiting.
        setStatus((s) => (s === "waiting" || s === "error" ? s : "finished"));
      },
    });

    return () => sub.unsubscribe();
  }, [agent]);

  const run = useCallback(
    async (resume?: string) => {
      if (running.current) return;
      running.current = true;
      setError(null);
      setStatus("running");

      // Clearing the interrupt before the run matters: without it a stale
      // envelope stays on screen and outranks whatever the next run sends,
      // because interrupt beats state (D7).
      setInterruptValue(null);

      try {
        await agent.runAgent(
          resume === undefined
            ? {}
            : // NOT `{ resume }` — see the header. This is the shape agent.py reads.
              { forwardedProps: { command: { resume } } },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      } finally {
        running.current = false;
      }
    },
    [agent],
  );

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const respond = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      // An empty response would resume the graph with nothing, which for a
      // draft-approval node means an unintended answer.
      if (!trimmed) return;
      void run(trimmed);
    },
    [run],
  );

  const reset = useCallback(() => {
    started.current = false;
    running.current = false;
    setInterruptValue(null);
    setStateComponent(null);
    setError(null);
    setStatus("idle");
    setThreadId(`t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }, []);

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);

  const resolution = useMemo(
    () => resolveEnvelope({ interruptValue, stateComponent }),
    [interruptValue, stateComponent],
  );

  return { resolution, respond, status, error, start, reset, threadId };
}
