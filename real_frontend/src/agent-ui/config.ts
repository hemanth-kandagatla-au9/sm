/**
 * agent-ui/config.ts
 *
 * Where the deterministic REST helpers live, and the two rules the Jira field
 * needs. These are *not* the agent stream — they are the small lookup endpoints
 * behind the dropdowns and the Jira pre-fill, which the graph does not need to
 * be woken up for.
 *
 * ── One difference from the reference implementation, and it matters ─────────
 * There, `API_BASE` was `NEXT_PUBLIC_AGUI_API_BASE` and the browser called the
 * backend directly. Here it is a **same-origin path**. The browser has no
 * backend host to learn, CORS never enters the picture, the CSP keeps
 * `connect-src 'self'`, and when auth arrives the token is attached in one
 * server-side place rather than at every call site.
 *
 * The cost is one more hop per lookup. On four small JSON endpoints behind a
 * proxy on the same host, that is not a real cost.
 */

/** Same-origin. See src/app/api/lookup/[resource]/route.ts for the allow-list. */
export const LOOKUP_BASE = "/api/lookup";

/**
 * Jira key shape. Defined identically in `agui_server.py` as `JIRA_KEY_PATTERN`.
 * The server re-validates rather than trusting this, so a mismatch here is a UX
 * bug, never a security one.
 */
export const JIRA_KEY_RE = /^[A-Za-z][A-Za-z0-9]+-\d+$/;

/**
 * How long after the last keystroke the Jira lookup fires. Leaving the field
 * fires immediately instead — see `useJiraLookup`.
 */
export const JIRA_DEBOUNCE_MS = 600;

/** Shape of the error body the lookup proxy returns. */
interface ProblemBody {
  error?: string;
  requestId?: string;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${LOOKUP_BASE}${path}`, {
    signal,
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    // The proxy returns a correlation id with every failure. Carrying it into
    // the thrown error means a user-visible message can quote something that
    // matches a server log line, without exposing what actually went wrong.
    const body = (await res.json().catch(() => ({}))) as ProblemBody;
    const suffix = body.requestId ? ` (ref ${body.requestId})` : "";
    throw new Error(`${body.error ?? `${res.status} ${res.statusText}`}${suffix}`);
  }

  return (await res.json()) as T;
}
