/**
 * POST /api/agent — same-origin proxy to the AWS Bedrock AgentCore runtime.
 *
 * The browser talks to this route; this route calls AgentCore's data-plane
 * invocation endpoint with an Azure AD bearer token minted server side.
 *
 * ── Why a plain HTTPS POST and no AWS SDK ───────────────────────────────────
 * The runtime is configured with a JWT/OAuth inbound authorizer rather than the
 * IAM (SigV4) default. AWS SDKs sign with SigV4 only, so they cannot make this
 * call at all. Per the AWS documentation the OAuth path is a plain POST to
 * `https://bedrock-agentcore.<region>.amazonaws.com/runtimes/<url-encoded
 * arn>/invocations?qualifier=<qualifier>` with `Authorization: Bearer <token>`.
 *
 * ── Why the proxy exists ────────────────────────────────────────────────────
 *   1. The Azure client secret is used here and never reaches the browser.
 *   2. The browser cannot call this endpoint itself; there is no CORS for it.
 *   3. One egress point means the CSP can say `connect-src 'self'`, so an
 *      injected script has no destination to exfiltrate a draft CR to.
 *
 * The AgentCore container speaks AG-UI: the same `RunAgentInput` goes in and the
 * same SSE events come out, so everything above the transport is unchanged. The
 * body is piped through untouched.
 */
import type { NextRequest } from "next/server";
import { getAccessToken, invalidateToken, TokenError } from "@/lib/agentcore-token";
import { getServerEnv } from "@/lib/env";
import { log, requestIdFrom } from "@/lib/logger";

/** Live stream: never prerendered, never cached. */
export const dynamic = "force-dynamic";
/** Streaming a response body through requires the Node runtime. */
export const runtime = "nodejs";

/**
 * A RunAgentInput carries the message history, so it is not tiny — but it is
 * not megabytes either. The cap stops this route being used as an open relay
 * for arbitrary payloads to an authenticated internal service.
 */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * How long to wait for AgentCore to respond with HEADERS. This is not a limit
 * on the stream: an interrupt can leave a graph waiting for a human for hours.
 * The timer is cleared the moment headers arrive.
 */
const CONNECT_TIMEOUT_MS = 30_000;

/**
 * AWS requires the runtime session id to be at least 33 characters and stable
 * across a conversation's turns, so the graph resumes the right checkpoint.
 * The client's `threadId` is shorter, so it is padded rather than replaced —
 * minting a second identifier would give the same conversation two names.
 */
function toRuntimeSessionId(threadId: string): string {
  return threadId.padEnd(33, "0");
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = requestIdFrom(req.headers);
  const startedAt = Date.now();
  const isDev = process.env.NODE_ENV !== "production";

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return problem(415, "Expected application/json.", requestId);
  }

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    log("warn", "agent.proxy.rejected", { requestId, reason: "body_too_large" });
    return problem(413, "Request body is too large.", requestId);
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch (err) {
    // Misconfiguration, not a user error. Loud in the log, opaque on the wire.
    const reason = err instanceof Error ? err.message : String(err);
    log("error", "agent.proxy.misconfigured", { requestId, reason });
    return problem(
      500,
      isDev ? `The server is not configured correctly. ${reason}` : "The server is not configured correctly.",
      requestId,
    );
  }

  /*
   * The session id comes from the body, because AgentCore keys the graph's
   * checkpoint on it. A malformed body still gets a valid (if unstable) id
   * rather than failing before the request reaches the runtime, which would
   * turn a backend validation error into a frontend one.
   */
  let threadId = "";
  try {
    threadId = (JSON.parse(body) as { threadId?: unknown })?.threadId as string;
  } catch {
    /* handled by the fallback below */
  }
  const sessionId = toRuntimeSessionId(
    typeof threadId === "string" && threadId ? threadId : `t-${Date.now()}`,
  );

  // One controller for two independent reasons to give up: the client went
  // away, or AgentCore never answered. Both must cancel the upstream request so
  // a closed tab does not leave a socket and a graph run alive behind it.
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());
  const connectTimer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

  try {
    let upstream = await invoke(env, body, sessionId, req, controller, requestId);

    /*
     * A 401 means the token we hold is not acceptable to the runtime, whatever
     * Azure thinks of it — a rotated secret, a reconfigured authorizer. Drop the
     * cache and try once more. Exactly once: a loop here would hammer both the
     * identity provider and AWS while every request hangs.
     */
    if (upstream.status === 401) {
      log("warn", "agent.proxy.reauthenticating", { requestId });
      invalidateToken();
      upstream = await invoke(env, body, sessionId, req, controller, requestId);
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      log("error", "agent.proxy.upstream_error", {
        requestId,
        status: upstream.status,
        runtimeArn: env.runtimeArn,
        durationMs: Date.now() - startedAt,
        detail: detail.slice(0, 500),
      });
      return problem(502, "The agent returned an error.", requestId, isDev ? detail.slice(0, 500) : undefined);
    }

    log("info", "agent.proxy.streaming", {
      requestId,
      status: upstream.status,
      ttfbMs: Date.now() - startedAt,
      awsRequestId: upstream.headers.get("x-amzn-requestid") ?? undefined,
    });

    return new Response(upstream.body, {
      status: 200,
      headers: {
        /*
         * Forwarded verbatim, and it is not always an event stream: a
         * `forwardedProps.lookup` request is answered with application/json by
         * the same endpoint. Overriding this would break the lookups.
         */
        "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
        // no-transform matters as much as no-cache: a compressing proxy will
        // happily buffer an event stream to get a better ratio.
        "cache-control": "no-cache, no-transform",
        // nginx and most enterprise ingresses buffer SSE unless told not to.
        "x-accel-buffering": "no",
        "x-request-id": requestId,
        // Correlates a browser network entry with an AWS-side trace. Not the
        // ARN: that is topology, and it belongs in the log rather than in a
        // response header any viewer can read.
        ...(upstream.headers.get("x-amzn-requestid")
          ? { "x-amzn-requestid": upstream.headers.get("x-amzn-requestid")! }
          : {}),
      },
    });
  } catch (err) {
    if (err instanceof TokenError) {
      return problem(
        502,
        "Could not authenticate with the agent service.",
        requestId,
        isDev ? err.message : undefined,
      );
    }

    const clientGone = req.signal.aborted;
    const reason = err instanceof Error ? err.message : String(err);
    log(clientGone ? "info" : "error", "agent.proxy.unreachable", {
      requestId,
      runtimeArn: env.runtimeArn,
      region: env.region,
      clientGone,
      durationMs: Date.now() - startedAt,
      reason,
    });

    // The ARN and region are topology; they go to the log. In development they
    // are echoed back, because there the reader and the operator are the same
    // person and a bare "fetch failed" has sent people hunting in the wrong
    // process before.
    return problem(
      502,
      "The agent is unavailable.",
      requestId,
      isDev ? `${reason} (runtime ${env.runtimeArn})` : undefined,
    );
  } finally {
    // Headers are in. The connect clock stops; the client-disconnect wiring
    // stays live for the whole stream.
    clearTimeout(connectTimer);
  }
}

async function invoke(
  env: ReturnType<typeof getServerEnv>,
  body: string,
  sessionId: string,
  req: NextRequest,
  controller: AbortController,
  requestId: string,
): Promise<Response> {
  const token = await getAccessToken(requestId);

  return fetch(env.invokeUrl, {
    method: "POST",
    // Only the headers the runtime needs. Client headers are NOT forwarded:
    // anything else the browser sends is not ours to relay to an authenticated
    // service, and a forwarded Authorization header would collide with ours.
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      // The AG-UI encoder picks its wire format from Accept, and a lookup asks
      // for application/json rather than an event stream.
      accept: req.headers.get("accept") ?? "text/event-stream",
      "x-amzn-bedrock-agentcore-runtime-session-id": sessionId,
      "x-request-id": requestId,
    },
    body,
    signal: controller.signal,
  });
}

/**
 * One error shape for every failure, carrying the correlation id and nothing
 * about the internals. The user gets something to quote; the log has the cause.
 */
function problem(status: number, message: string, requestId: string, detail?: string): Response {
  return Response.json(
    { error: message, requestId, ...(detail ? { detail } : {}) },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
