/**
 * agent-ui/useAgentSession.ts
 *
 * The only file in the app that knows how the agent is reached. Everything below
 * it — `resolveEnvelope`, the registry, the host, all eight cards — takes plain
 * values and would not notice if this were rewritten.
 *
 * ── Two things this backend does differently from the AG-UI docs ─────────────
 * Both verified by reading `ag-ui-langgraph==0.0.42`, which is what
 * `agui_server.py` pins. Following the current documentation instead fails
 * silently in both cases — no error, no log line, nothing to explain it.
 *
 * **1. Interrupts arrive as a CUSTOM event named `on_interrupt`.**
 * `RunFinishedEvent` is constructed with no `outcome` field, so
 * `agent.pendingInterrupts` and `onRunFinishedEvent`'s `outcome: "interrupt"`
 * branch never fire against this backend. The envelope is `event.value`.
 *
 * **2. Resume travels in `forwardedProps.command.resume`.**
 * `RunAgentInput.resume` exists in the protocol *and* on `runAgent()`, and
 * `agent.py` never reads it. Sending it is accepted by Pydantic, returns no
 * error, and the graph never wakes up. This is the sharpest trap here.
 *
 * **3. The interrupt value arrives JSON-encoded, as a string.**
 * `dump_json_safe()` in the same package runs `json.dumps()` on any non-string
 * interrupt value, so `event.value` is a string containing the envelope rather
 * than the envelope. Without the parse below every card resolves as `malformed`
 * and the whole conversation renders fallback cards.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { HttpAgent } from "@ag-ui/client";
import { CONTRACT_VERSION } from "./contract.generated";
import { resolveEnvelope } from "./resolveEnvelope";
import type { Turn } from "./transcript";
import {
  appendTurn,
  getServerSnapshot,
  getSnapshot,
  resetTranscript,
  settleOpenTurn,
  subscribe,
} from "./transcriptStore";
import type { Resolution } from "./types";

/** The custom-event name ag-ui-langgraph uses for LangGraph interrupts. */
const ON_INTERRUPT = "on_interrupt";
/** The custom-event name `emit_progress()` dispatches from inside a node. */
const ON_PROGRESS = "progress";

/**
 * Undo the encoder's JSON-encoding of the interrupt value.
 *
 * `dump_json_safe()` in ag-ui-langgraph runs `json.dumps()` on any non-string
 * interrupt value, so the envelope arrives as a string containing the envelope.
 *
 * This lives in the transport, not in `resolveEnvelope`, because it is a quirk
 * of *this backend's encoder* rather than of the contract. The contract layer
 * stays protocol-pure and keeps treating a string as malformed, which is what it
 * is once this function has had its turn.
 *
 * A string that does not parse is returned unchanged: `resolveEnvelope` then
 * reports it as malformed, which is the truth.
 */
export function unwrapInterruptValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export type SessionStatus = "idle" | "running" | "waiting" | "finished" | "error";

export interface AgentSession {
  /** The whole conversation, oldest first. The last entry is the live one. */
  turns: readonly Turn[];
  /** What the host should render for the live turn. */
  resolution: Resolution;
  /**
   * Answer the open interrupt. `label` is the human text the card showed for
   * this choice; it is what the transcript echoes back to the user.
   */
  respond: (value: string, label?: string) => void;
  status: SessionStatus;
  error: string | null;
  /**
   * The most recent mid-node status message, e.g. "Fetching Jira ticket
   * AAZM-4668…". Null when nothing has been reported for the run in flight, or
   * once the graph pauses again and the message is no longer current.
   *
   * Without this, the longest steps in the flow look like the app has frozen.
   */
  progress: string | null;
  /**
   * The draft as the agent writes it, token by token.
   *
   * `node_6` generates the CR draft with a plain LLM call rather than structured
   * output, so the package relays it as TEXT_MESSAGE_START/CONTENT/END. Null
   * before the stream begins and once the run pauses, because the finished
   * draft then arrives as a normal envelope.
   */
  draftStream: string | null;
  /** Begin the conversation. Safe to call twice; the second is ignored. */
  start: () => void;
  /** Drop all local state, clear storage, and start over on a fresh thread. */
  reset: () => void;
  /**
   * Abandon this conversation and open a new one, running immediately.
   *
   * Not `reset()` followed by `start()`: `reset` mints a new thread id, and the
   * `HttpAgent` for it does not exist until the next render. Calling `start` in
   * the same handler would run against the agent that was captured before the
   * reset — the new conversation would continue the old thread, and the graph
   * would answer from wherever that one had got to.
   */
  restart: () => void;
  threadId: string;
  /** False until the persisted transcript has been read. */
  hydrated: boolean;
}

export interface UseAgentSessionOptions {
  /** Defaults to the same-origin proxy at /api/agent. */
  url?: string;
  autoStart?: boolean;
}

export function useAgentSession({
  url = "/api/agent",
  autoStart = false,
}: UseAgentSessionOptions = {}): AgentSession {
  /*
   * The transcript lives in an external store backed by sessionStorage, read
   * through `useSyncExternalStore` — see transcriptStore.ts for why neither a
   * lazy initialiser nor an effect is the right tool here.
   */
  const { threadId, turns } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = threadId !== "";

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * The two render sources, kept separate on purpose. `resolveEnvelope` decides
   * between them; this hook must not pre-empt that decision by collapsing them.
   */
  const [interruptValue, setInterruptValue] = useState<unknown>(null);
  const [stateComponent, setStateComponent] = useState<unknown>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [draftStream, setDraftStream] = useState<string | null>(null);
  /**
   * Which TEXT_MESSAGE_* stream `draftStream` belongs to, so a second stream
   * cannot interleave its tokens into the first one's text.
   */
  const streamingMessageId = useRef<string | null>(null);

  const agent = useMemo(
    () => (threadId ? new HttpAgent({ url, agentId: "cr-co", threadId }) : null),
    [url, threadId],
  );

  const running = useRef(false);
  const started = useRef(false);
  /**
   * Mirrors `interruptValue` for the event handlers. They run outside React's
   * render, so they cannot read the state variable's current value — only a ref
   * gives them "is an interrupt open right now?".
   */
  const interruptRef = useRef<unknown>(null);

  /**
   * Validate an arriving envelope and record it as a turn.
   *
   * Validation happens here, not in the store: nothing unvalidated should enter
   * the transcript, because the transcript is persisted and will be rendered
   * again after a reload. `resolveEnvelope` is the one place that decides what a
   * valid envelope is, so it is reused rather than re-implemented.
   */
  const record = useCallback((raw: unknown) => {
    const resolved = resolveEnvelope({ interruptValue: raw });
    if (resolved.status !== "ok") return;
    appendTurn({
      // Already checked against CONTRACT_VERSION by resolveEnvelope, so this
      // records what was verified rather than asserting something new.
      version: CONTRACT_VERSION,
      name: resolved.name,
      props: resolved.props as Record<string, unknown>,
    });
  }, []);

  useEffect(() => {
    if (!agent) return;

    const sub = agent.subscribe({
      onCustomEvent({ event }) {
        if (event.name === ON_PROGRESS) {
          const value = event.value as { message?: unknown } | undefined;
          if (typeof value?.message === "string") setProgress(value.message);
          return;
        }

        if (event.name !== ON_INTERRUPT) return;

        // The graph is blocked. `event.value` is the ui_component envelope,
        // JSON-encoded by the backend's encoder — see `unwrapInterruptValue`.
        const value = unwrapInterruptValue(event.value);

        setInterruptValue(value);
        interruptRef.current = value;
        setStatus("waiting");
        record(value);

        // The card has arrived, so the progress message describes work that has
        // already finished. It must not linger underneath the next question.
        setProgress(null);
        setDraftStream(null);
        streamingMessageId.current = null;
      },

      onTextMessageStartEvent({ event }) {
        streamingMessageId.current = event.messageId;
        setDraftStream("");
      },

      onTextMessageContentEvent({ event }) {
        if (event.messageId !== streamingMessageId.current) return;
        setDraftStream((prev) => (prev ?? "") + event.delta);
      },

      onTextMessageEndEvent({ event }) {
        if (event.messageId === streamingMessageId.current) streamingMessageId.current = null;
      },

      /**
       * One handler for both STATE_SNAPSHOT and STATE_DELTA.
       *
       * `onStateChanged` receives the **merged** state, so RFC-6902 deltas are
       * already applied and there is no patching to re-implement. The per-event
       * hooks are deliberately unused: `onStateDeltaEvent` fires with the patch,
       * and reading `agent.state` inside it returns the state from *before* the
       * patch — which silently produced no card at all when the agent sent
       * `ui_component` as a delta rather than a snapshot.
       */
      onStateChanged({ state }) {
        const s = state as { ui_component?: unknown } | undefined;
        const ui = s?.ui_component ?? null;
        setStateComponent(ui);
        // A pending interrupt outranks state, so state must not append a turn
        // while one is open — on reconnect the snapshot is stale by design.
        if (!interruptRef.current) record(ui);
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
  }, [agent, record]);

  const resolution = useMemo(
    () => resolveEnvelope({ interruptValue, stateComponent }),
    [interruptValue, stateComponent],
  );

  const run = useCallback(
    async (resume?: string) => {
      if (!agent || running.current) return;
      running.current = true;
      setError(null);
      setStatus("running");

      // Clearing the interrupt before the run matters: without it a stale
      // envelope stays on screen and outranks whatever the next run sends,
      // because a pending interrupt beats state.
      setInterruptValue(null);
      interruptRef.current = null;
      setProgress(null);
      setDraftStream(null);
      streamingMessageId.current = null;

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
    if (started.current || !agent) return;
    started.current = true;
    void run();
  }, [agent, run]);

  const respond = useCallback(
    (value: string, label?: string) => {
      const trimmed = value.trim();
      // An empty response would resume the graph with nothing, which on a
      // draft-approval node means an unintended answer.
      if (!trimmed) return;

      // Settle the open turn before the run starts, so the transcript shows the
      // user's reply immediately rather than after the agent has answered.
      settleOpenTurn({ value: trimmed, label: label ?? trimmed, at: Date.now() });

      void run(trimmed);
    },
    [run],
  );

  const reset = useCallback(() => {
    started.current = false;
    running.current = false;
    setInterruptValue(null);
    interruptRef.current = null;
    setStateComponent(null);
    setError(null);
    setStatus("idle");
    setProgress(null);
    setDraftStream(null);
    streamingMessageId.current = null;
    resetTranscript();
  }, []);

  /**
   * Set by `restart`, consumed once the agent for the new thread exists.
   * A ref rather than state because it is a one-shot instruction to the next
   * render, not something the UI displays.
   */
  const startOnNewThread = useRef(false);

  const restart = useCallback(() => {
    startOnNewThread.current = true;
    reset();
  }, [reset]);

  useEffect(() => {
    if (!agent || !startOnNewThread.current) return;
    startOnNewThread.current = false;
    started.current = true;
    void run();
  }, [agent, run]);

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);

  return {
    turns,
    resolution,
    respond,
    status,
    error,
    progress,
    draftStream,
    start,
    reset,
    restart,
    threadId,
    hydrated,
  };
}
