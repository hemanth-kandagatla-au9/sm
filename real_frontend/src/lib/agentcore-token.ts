/**
 * lib/agentcore-token.ts — the Azure AD bearer token AgentCore's JWT authorizer
 * expects.
 *
 * A client-credentials grant, minted server side and cached in module memory.
 * The secret never leaves this process, and the token never reaches the browser.
 *
 * ── Three things beyond "fetch a token and keep it" ─────────────────────────
 *
 * **Single flight.** A naive cache lets every concurrent cold request mint its
 * own token. On a page that opens with several lookups in parallel that is four
 * or five token requests for one page load, and Azure AD rate-limits the
 * endpoint. The in-flight promise is shared, so concurrent callers await one
 * request.
 *
 * **Invalidation.** A cached token that Azure considers valid can still be
 * rejected by AgentCore: the app registration changes, the scope is revoked, the
 * runtime's authorizer is reconfigured. Without a way to drop the cache, the
 * process serves 401s until it restarts. `invalidateToken()` exists so the proxy
 * can clear it and retry exactly once.
 *
 * **The clock skew margin.** Refreshing 60 seconds early means an in-flight
 * request never races real expiry.
 */
import "server-only";
import { getServerEnv } from "./env";
import { log } from "./logger";

interface CachedToken {
  value: string;
  /** Epoch ms, already reduced by the safety margin. */
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 60_000;

/** Azure AD is normally fast; a hang here would stall every agent request. */
const TOKEN_TIMEOUT_MS = 10_000;

let cached: CachedToken | null = null;
/** Shared by concurrent callers so only one request is ever in flight. */
let inFlight: Promise<string> | null = null;

/** Thrown when the token cannot be obtained. Carries no secret. */
export class TokenError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

async function mint(requestId: string): Promise<string> {
  const { azure } = getServerEnv();
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(azure.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: azure.clientId,
        client_secret: azure.clientSecret,
        scope: azure.scope,
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log("error", "token.unreachable", { requestId, tenantId: azure.tenantId, reason });
    throw new TokenError(`Could not reach the identity provider: ${reason}`);
  }

  if (!res.ok) {
    // Azure's error body names the failing condition — wrong secret, unknown
    // scope, disabled app. It goes to the log and never to the browser.
    const detail = await res.text().catch(() => "");
    log("error", "token.rejected", {
      requestId,
      status: res.status,
      tenantId: azure.tenantId,
      clientId: azure.clientId,
      scope: azure.scope,
      detail: detail.slice(0, 500),
    });
    throw new TokenError(`The identity provider rejected the request (${res.status}).`, res.status);
  }

  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;

  if (typeof body?.access_token !== "string" || !body.access_token) {
    log("error", "token.malformed", { requestId, status: res.status });
    throw new TokenError("The identity provider returned no access token.");
  }

  // Azure always sends expires_in, but a missing value must not produce a token
  // cached until the heat death of the universe.
  const expiresInSeconds = typeof body.expires_in === "number" ? body.expires_in : 3600;

  cached = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(0, expiresInSeconds * 1000 - REFRESH_MARGIN_MS),
  };

  log("info", "token.minted", {
    requestId,
    tookMs: Date.now() - startedAt,
    expiresInSeconds,
  });

  return cached.value;
}

/** A valid bearer token, from cache when possible. */
export async function getAccessToken(requestId: string): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight) return inFlight;

  inFlight = mint(requestId).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * Drop the cached token so the next call mints a fresh one.
 *
 * Called by the proxy when AgentCore answers 401: the token we hold is not
 * acceptable to the runtime, whatever Azure thinks of it.
 */
export function invalidateToken(): void {
  cached = null;
}

/** Test seam. Never called by application code. */
export function __resetTokenCacheForTests(): void {
  cached = null;
  inFlight = null;
}
