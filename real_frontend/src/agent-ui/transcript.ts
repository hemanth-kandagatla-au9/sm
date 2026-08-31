/**
 * agent-ui/transcript.ts
 *
 * The conversation as a list of turns, and its per-thread persistence.
 *
 * ── Why the frontend has to keep this ───────────────────────────────────────
 * The agent hands us **one** envelope at a time. `AgentState.ui_component` holds
 * the latest card and nothing before it, so there is no history to ask the
 * backend for. A conversation-shaped UI therefore has to accumulate its own
 * record as it goes.
 *
 * ── Why sessionStorage ──────────────────────────────────────────────────────
 * In-memory alone loses the whole conversation on refresh, which on a
 * change-request path means a user who pressed F5 cannot see what they already
 * approved. sessionStorage survives that, stays on the one device, and clears
 * itself when the tab closes — appropriate for data that includes draft CR
 * contents.
 *
 * It does not survive a different device or browser. Closing that gap needs the
 * backend to keep an envelope list per thread; recorded in docs/GAPS.md and
 * raised with their team.
 */
import type { AgentComponentEnvelope, TurnAnswer } from "./types";

export interface Turn {
  /** Stable across re-renders and reloads: position in the conversation. */
  id: string;
  envelope: AgentComponentEnvelope;
  /** Absent while this turn is the open question. */
  answer?: TurnAnswer;
}

/**
 * Cap on stored turns. A `draftReview` envelope is a few KB, and sessionStorage
 * is around 5 MB — so this is not close to the limit, but an unbounded list in
 * storage is the kind of thing that works for a year and then fails in front of
 * someone. The transcript in memory is not truncated; only what is persisted.
 */
const MAX_PERSISTED_TURNS = 50;

const KEY_PREFIX = "crco:transcript:";
const THREAD_KEY = "crco:thread";

/**
 * Every access is wrapped. Storage throws rather than returning null in a
 * surprising number of real situations — Safari private browsing, embedded
 * webviews, enterprise policies that disable site data, and quota exhaustion.
 * None of those should take the conversation down with them.
 */
function safeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Quota or a disabled store. The in-memory transcript is unaffected; only
    // its survival across a refresh is lost, which is not worth an error to the
    // user mid-approval.
  }
}

function safeRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* see safeSet */
  }
}

/** The thread this tab is on, reused across reloads so the transcript matches. */
export function readOrCreateThreadId(): string {
  const existing = safeGet(THREAD_KEY);
  if (existing) return existing;
  const fresh = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  safeSet(THREAD_KEY, fresh);
  return fresh;
}

export function newThreadId(): string {
  const fresh = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  safeSet(THREAD_KEY, fresh);
  return fresh;
}

export function loadTurns(threadId: string): Turn[] {
  const raw = safeGet(KEY_PREFIX + threadId);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Stored data is data, not trusted input: it was written by an older build
    // of this app, and the shape may have moved since. Anything that does not
    // look like a turn is dropped rather than rendered.
    return parsed.filter(isTurn);
  } catch {
    return [];
  }
}

export function saveTurns(threadId: string, turns: Turn[]): void {
  const tail = turns.slice(-MAX_PERSISTED_TURNS);
  safeSet(KEY_PREFIX + threadId, JSON.stringify(tail));
}

export function clearTurns(threadId: string): void {
  safeRemove(KEY_PREFIX + threadId);
}

function isTurn(value: unknown): value is Turn {
  if (value == null || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string") return false;

  const env = t.envelope;
  if (env == null || typeof env !== "object") return false;
  const e = env as Record<string, unknown>;
  return typeof e.name === "string" && typeof e.version === "number";
}

/**
 * Two envelopes describe the same question when the component and its props
 * match. Used to decide whether an arriving envelope opens a new turn or is a
 * re-delivery of the one already on screen — which happens on every reconnect,
 * because a pending interrupt is re-sent without a state snapshot.
 *
 * Without this check, reconnecting would append a duplicate card to the
 * transcript each time.
 */
export function isSameQuestion(
  a: AgentComponentEnvelope | undefined,
  b: AgentComponentEnvelope,
): boolean {
  if (!a) return false;
  if (a.name !== b.name || a.version !== b.version) return false;
  try {
    return JSON.stringify(a.props) === JSON.stringify(b.props);
  } catch {
    return false;
  }
}
