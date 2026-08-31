/**
 * agent-ui/transcriptStore.ts
 *
 * The transcript as an external store, read through `useSyncExternalStore`.
 *
 * ── Why this is not `useState` ──────────────────────────────────────────────
 * The transcript's source of truth is sessionStorage, which does not exist
 * during server rendering. Two ways of bridging that were tried and rejected:
 *
 *   - **Lazy initialiser** (`useState(() => load())`) renders an empty
 *     transcript on the server and a full one on the client. React resolves that
 *     hydration mismatch by discarding one of them, silently.
 *   - **Read in an effect** (`useEffect(() => setTurns(load()))`) works, but it
 *     is a cascading render on every mount, and the React compiler lint rejects
 *     it — correctly, because reading an external store is precisely what
 *     `useSyncExternalStore` exists for.
 *
 * `getServerSnapshot` returns a stable empty transcript, so the server renders
 * nothing and the client swaps in the real one after mount without a mismatch.
 *
 * Writes are plain function calls from event handlers — an envelope arriving, a
 * user answering — not effects reacting to render.
 */
import {
  clearTurns,
  isSameQuestion,
  loadTurns,
  newThreadId,
  readOrCreateThreadId,
  saveTurns,
  type Turn,
} from "./transcript";
import type { AgentComponentEnvelope, TurnAnswer } from "./types";

export interface TranscriptSnapshot {
  /** Empty until the store has been read on the client. */
  readonly threadId: string;
  readonly turns: readonly Turn[];
}

/**
 * Both of these must be referentially stable: `useSyncExternalStore` compares
 * snapshots by identity and will loop forever if a new object is returned on
 * every call.
 */
const EMPTY: TranscriptSnapshot = Object.freeze({ threadId: "", turns: Object.freeze([]) });

let snapshot: TranscriptSnapshot = EMPTY;
let loaded = false;

const listeners = new Set<() => void>();

function emit(next: TranscriptSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Read sessionStorage once, on the first client subscription. */
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const threadId = readOrCreateThreadId();
  emit({ threadId, turns: loadTurns(threadId) });
}

export function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): TranscriptSnapshot {
  return snapshot;
}

export function getServerSnapshot(): TranscriptSnapshot {
  return EMPTY;
}

function commit(turns: Turn[]): void {
  const { threadId } = snapshot;
  emit({ threadId, turns });
  if (threadId) saveTurns(threadId, turns);
}

/**
 * Record a question the agent has asked.
 *
 * Ignored when it repeats the open question — a pending interrupt is
 * re-delivered on every reconnect, and in a normal turn the same envelope
 * arrives twice, once on the state channel and once as the interrupt. Without
 * this the transcript would gain a duplicate card each time.
 */
export function appendTurn(envelope: AgentComponentEnvelope): void {
  const turns = snapshot.turns;
  const last = turns[turns.length - 1];
  if (last && !last.answer && isSameQuestion(last.envelope, envelope)) return;
  commit([...turns, { id: `${turns.length}`, envelope }]);
}

/** Settle the open turn with what the user chose. */
export function settleOpenTurn(answer: TurnAnswer): void {
  const turns = snapshot.turns;
  const last = turns[turns.length - 1];
  if (!last || last.answer) return;
  commit([...turns.slice(0, -1), { ...last, answer }]);
}

/** Abandon this conversation and start a new thread. */
export function resetTranscript(): void {
  if (snapshot.threadId) clearTurns(snapshot.threadId);
  emit({ threadId: newThreadId(), turns: [] });
}
