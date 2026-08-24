/**
 * POST /api/agent/mock — a scripted AG-UI backend for development.
 *
 * This is **not** a fake agent object. It serves the real AG-UI SSE wire format,
 * so `HttpAgent`, its parser, and every subscriber path are exercised exactly as
 * they will be against Python. The only thing missing is the graph.
 *
 * ── Faithfulness ────────────────────────────────────────────────────────────
 * The event *sequence* is copied from `ag_ui_langgraph==0.0.42`'s `agent.py`,
 * not from the AG-UI docs, which describe a newer protocol. In particular:
 *
 *   - interrupts are a CUSTOM event named `on_interrupt`, never
 *     `RunFinished.outcome`; `RUN_FINISHED` carries no `outcome` at all;
 *   - a normal turn emits STEP_STARTED → … → STATE_SNAPSHOT →
 *     MESSAGES_SNAPSHOT → STEP_FINISHED → RUN_FINISHED
 *     (`get_state_and_messages_snapshots` always emits both, in that order);
 *   - **STATE_SNAPSHOT carries the whole AgentState**, not just `ui_component`.
 *     A mock that sends `{ ui_component }` alone would let a card pass here and
 *     fail against a real snapshot with twenty other keys in it;
 *   - the reconnect path emits RUN_STARTED → on_interrupt → RUN_FINISHED and
 *     **no snapshot at all**;
 *   - the encoder emits `data: {json}\n\n`, camelCase, nulls omitted
 *     (`model_dump_json(by_alias=True, exclude_none=True)`).
 *
 * Scenarios via `?scenario=`:
 *   flow        the CR/CO conversation, advancing on each resume (default)
 *   reconnect   pending interrupt re-delivered with NO state snapshot (D7)
 *   delta       the card arrives only via STATE_DELTA, as a JSON Patch —
 *               no interrupt, so it exercises the state path and the client's
 *               patch application
 *   text        the agent streams an assistant message before the card
 *   error       RUN_ERROR mid-run
 */
import { NextRequest } from "next/server";
import { FIXTURES } from "@/agent-ui/fixtures.generated";
import { CONTRACT_VERSION, type ComponentName } from "@/agent-ui/contract.generated";

export const dynamic = "force-dynamic";

/** Per-thread cursor. Dev-only, so module memory is fine. */
const threads = new Map<string, number>();

const envelope = (name: ComponentName) => ({
  version: CONTRACT_VERSION,
  name,
  props: {
    ...FIXTURES[name],
    meta: {
      timestamp: "11th Feb, 26  21:13 pm",
      processing_time: "30 sec",
      tokens: 23,
      cost: "$00023",
    },
  },
});

/**
 * A realistic `AgentState`. Keys taken from `state/state.py` — the real snapshot
 * is the whole state object, and a card that only survives `{ ui_component }`
 * has not actually been tested.
 */
const agentState = (ui: unknown, node: string) => ({
  messages: [],
  reason_for_change: { value: "Config change to the treasury posting rules.", given: true, valid: true },
  description_of_change: { value: "", given: false, valid: false },
  target_system: { value: "HMD MBOX", given: true, valid: true },
  platform: { value: "Galaxy", given: true, valid: true },
  template_id: null,
  cr_id: null,
  jira_id: { value: "AAZM-11112", given: true, valid: true },
  draft: null,
  iteration: 1,
  exhausted_attempts: false,
  metrics: { node, tokens: 23, cost: "$00023" },
  baseline_crs: {},
  submission_result: null,
  scope_confirmed: true,
  scope_out_count: 0,
  end_session: false,
  cycle_confirmed: false,
  cycle_hitl_attempts: 0,
  platform_tgt_pending: null,
  platform_tgt_overridden: false,
  ui_component: ui,
});

const FLOW: ComponentName[] = [
  "crModeChoice",
  "crIntakeForm",
  "templateOrCrPicker",
  "cycleIdPicker",
  "draftReview",
  "submissionResult",
];

function sse(event: Record<string, unknown>) {
  // exclude_none: the Python encoder omits nulls, so the mock must too.
  const clean = Object.fromEntries(
    Object.entries(event).filter(([, v]) => v !== null && v !== undefined),
  );
  return `data: ${JSON.stringify(clean)}\n\n`;
}

export async function POST(req: NextRequest) {
  const scenario = req.nextUrl.searchParams.get("scenario") ?? "flow";
  const body = (await req.json()) as {
    threadId?: string;
    runId?: string;
    forwardedProps?: { command?: { resume?: unknown } };
  };

  const threadId = body.threadId ?? "mock-thread";
  const runId = body.runId ?? `mock-run-${Date.now()}`;
  const resume = body.forwardedProps?.command?.resume;

  // Advance only on a resume. A run with no resume is either the opening turn or
  // a reconnect to an interrupt that is still pending — neither moves the graph.
  let cursor = threads.get(threadId) ?? 0;
  if (resume !== undefined && resume !== null) {
    cursor = String(resume).trim().toLowerCase() === "bulk" ? -1 : cursor + 1;
    threads.set(threadId, cursor);
  }

  const name: ComponentName =
    cursor === -1 ? "featureComingSoon" : (FLOW[Math.min(cursor, FLOW.length - 1)] as ComponentName);
  const node = cursor <= 0 ? "node_0_wait" : `node_${cursor}`;
  const ui = envelope(name);

  const chunks: string[] = [sse({ type: "RUN_STARTED", threadId, runId })];

  if (scenario === "error") {
    chunks.push(sse({ type: "STEP_STARTED", stepName: node }));
    chunks.push(sse({ type: "RUN_ERROR", message: "Graph raised: SolMan is unavailable.", code: "503" }));
    return stream(chunks);
  }

  // ── Reconnect: exactly what agent.py's short-circuit path emits ───────────
  if (scenario === "reconnect") {
    chunks.push(sse({ type: "CUSTOM", name: "on_interrupt", value: ui }));
    chunks.push(sse({ type: "RUN_FINISHED", threadId, runId }));
    return stream(chunks);
  }

  chunks.push(sse({ type: "STEP_STARTED", stepName: node }));

  if (scenario === "text") {
    const id = `msg-${Date.now()}`;
    chunks.push(sse({ type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" }));
    for (const part of ["Looking at your platform ", "and target system… "]) {
      chunks.push(sse({ type: "TEXT_MESSAGE_CONTENT", messageId: id, delta: part }));
    }
    chunks.push(sse({ type: "TEXT_MESSAGE_END", messageId: id }));
  }

  if (scenario === "delta") {
    // The card arrives purely as a JSON Patch against a prior snapshot — no
    // interrupt. Exercises the state path and the client's patch application.
    chunks.push(sse({ type: "STATE_SNAPSHOT", snapshot: agentState(null, node) }));
    chunks.push(sse({ type: "MESSAGES_SNAPSHOT", messages: [] }));
    chunks.push(
      sse({ type: "STATE_DELTA", delta: [{ op: "replace", path: "/ui_component", value: ui }] }),
    );
    chunks.push(sse({ type: "STEP_FINISHED", stepName: node }));
    chunks.push(sse({ type: "RUN_FINISHED", threadId, runId }));
    return stream(chunks);
  }

  // ── Normal interrupt turn ─────────────────────────────────────────────────
  chunks.push(sse({ type: "CUSTOM", name: "on_interrupt", value: ui }));
  chunks.push(sse({ type: "STATE_SNAPSHOT", snapshot: agentState(ui, node) }));
  chunks.push(sse({ type: "MESSAGES_SNAPSHOT", messages: [] }));
  chunks.push(sse({ type: "STEP_FINISHED", stepName: node }));
  chunks.push(sse({ type: "RUN_FINISHED", threadId, runId }));
  return stream(chunks);
}

function stream(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
        // A small gap so the client genuinely parses a stream rather than one
        // buffer — the ordering bugs this harness exists to catch only appear
        // when events arrive separately.
        await new Promise((r) => setTimeout(r, 25));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
