/**
 * agent-ui/config.ts
 *
 * Where the deterministic REST helpers live. These are *not* the agent stream —
 * they are the small lookup endpoints `agui_server.py` exposes for dropdown and
 * pre-fill data that the graph does not need to be woken up for:
 *
 *   GET /api/platforms
 *   GET /api/target-systems?platform=…
 *   GET /api/templates?platform=…
 *   GET /api/jira-lookup?jira_id=…
 *
 * Overridable so the platform team can point the cards at their own host without
 * touching component code.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_AGUI_API_BASE ?? "http://localhost:8084";

/** The agent's registered name — must match `LangGraphAGUIAgent(name=…)`. */
export const AGENT_NAME = process.env.NEXT_PUBLIC_AGUI_AGENT_NAME ?? "local_agent";

/**
 * Jira key shape. Defined identically in `agui_server.py` as `JIRA_KEY_PATTERN`
 * so the two can be asserted equal in a test. The server re-validates rather
 * than trusting this, so a mismatch is a UX bug, never a security one.
 */
export const JIRA_KEY_RE = /^[A-Za-z][A-Za-z0-9]+-\d+$/;

/**
 * How long after the last keystroke the Jira lookup fires. Leaving the field
 * fires immediately instead — see `useJiraLookup`.
 */
export const JIRA_DEBOUNCE_MS = 600;

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}
