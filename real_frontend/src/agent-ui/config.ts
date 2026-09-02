/**
 * agent-ui/config.ts
 *
 * The deterministic lookups behind the dropdowns and the Jira pre-fill.
 *
 * ── Why these are no longer GETs ────────────────────────────────────────────
 * They used to be four REST endpoints on `agui_server.py`. AgentCore's data
 * plane exposes exactly one route to the outside world, `POST /invocations`, so
 * a separate host to GET from no longer exists.
 *
 * They now ride the same `/api/agent` proxy as a `forwardedProps.lookup`
 * payload, which the runtime's `/invocations` handler short-circuits before the
 * LangGraph agent is touched:
 *
 *   { lookup: { type: "platforms" } }
 *   { lookup: { type: "target_systems", platform } }
 *   { lookup: { type: "templates", platform?, limit? } }
 *   { lookup: { type: "jira_lookup", jira_id } }
 *
 * The response is `application/json`, not an event stream. The proxy forwards
 * the upstream content type verbatim, which is what makes one route able to
 * answer both shapes.
 *
 * `apiGet` keeps the old `GET /api/...?query` call shape so the two call sites
 * did not have to change. That is a deliberate seam: if the lookups ever get
 * their own endpoints again, this file changes and nothing else does.
 */
import { publicEnv } from "@/lib/public-env";

/**
 * Jira key shape. Defined identically in the backend as `JIRA_KEY_PATTERN`.
 * The server re-validates rather than trusting this, so a mismatch here is a UX
 * bug, never a security one.
 */
export const JIRA_KEY_RE = /^[A-Za-z][A-Za-z0-9]+-\d+$/;

/**
 * How long after the last keystroke the Jira lookup fires. Leaving the field
 * fires immediately instead — see `useJiraLookup`.
 */
export const JIRA_DEBOUNCE_MS = 600;

/** Shape of the error body the agent proxy returns. */
interface ProblemBody {
  error?: string;
  requestId?: string;
}

/**
 * A lookup is not a conversation, so it gets its own thread id rather than
 * joining the user's.
 *
 * AgentCore keys the graph's checkpoint on the session id derived from this, and
 * a lookup that shared the conversation's thread would resume that checkpoint.
 * The nonce keeps each lookup isolated and discardable.
 */
function lookupIds(): { threadId: string; runId: string } {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { threadId: `lookup-${nonce}`, runId: `lookup-${nonce}` };
}

async function callLookup<T>(
  lookup: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const { threadId, runId } = lookupIds();

  const res = await fetch(publicEnv.agentPath, {
    method: "POST",
    signal,
    // Asking for JSON is what tells the runtime this is not a stream request.
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      threadId,
      runId,
      state: {},
      messages: [],
      tools: [],
      context: [],
      forwardedProps: { lookup },
    }),
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

/** Translates the old `GET /api/...?query` call shape into a lookup request. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);

  switch (pathname) {
    case "/api/platforms":
    case "/platforms":
      return callLookup<T>({ type: "platforms" }, signal);

    case "/api/target-systems":
    case "/target-systems":
      return callLookup<T>(
        { type: "target_systems", platform: params.get("platform") ?? "" },
        signal,
      );

    case "/api/templates":
    case "/templates":
      return callLookup<T>(
        {
          type: "templates",
          platform: params.get("platform") ?? undefined,
          limit: params.has("limit") ? Number(params.get("limit")) : undefined,
        },
        signal,
      );

    case "/api/jira-lookup":
    case "/jira-lookup":
      return callLookup<T>({ type: "jira_lookup", jira_id: params.get("jira_id") ?? "" }, signal);

    default:
      // Loud rather than a silent 404: an unmapped path is a programming error,
      // and there is no endpoint left for it to accidentally hit.
      throw new Error(`apiGet: no lookup mapping for path "${path}"`);
  }
}
