/**
 * POST /api/agent — same-origin proxy to the backend's AG-UI endpoint.
 *
 * The browser talks to this route; this route streams to `agui_server.py`.
 * Three reasons it exists rather than the browser calling the backend directly:
 *
 *   1. **The browser never learns the backend host.** One egress point, one
 *      place to attach credentials when auth lands, nothing to discover in the
 *      bundle or in devtools.
 *   2. **CORS stops being a negotiation.** Same-origin needs no allow-list
 *      widened for every developer's port.
 *   3. **CSP can say `connect-src 'self'`** — the strictest useful value, and
 *      only possible because every request the page makes is same-origin.
 *
 * The response body is piped straight through. Buffering it would turn a live
 * event stream into a single delivery at the end of the run, which is exactly
 * the failure that makes an agent UI feel broken.
 */
import type { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { log, requestIdFrom } from "@/lib/logger";

/** Live stream: never prerendered, never cached. */
export const dynamic = "force-dynamic";
/** Streaming a response body through requires the Node runtime. */
export const runtime = "nodejs";

/**
 * A RunAgentInput carries the message history, so it is not tiny — but it is
 * not megabytes either. The cap stops this route being used as an open relay
 * for arbitrary payloads to an internal host.
 */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * How long to wait for the backend to respond with HEADERS. This is not a limit
 * on the stream: an interrupt can leave a graph waiting for a human for hours.
 * The timer is cleared the moment headers arrive.
 */
const CONNECT_TIMEOUT_MS = 15_000;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = requestIdFrom(req.headers);
  const startedAt = Date.now();
  const isDev = process.env.NODE_ENV !== "production";

  let backendUrl: string;
  try {
    backendUrl = getServerEnv().aguiBackendUrl;
  } catch (err) {
    // Misconfiguration, not a user error. Loud in the log, opaque on the wire.
    log("error", "agent.proxy.misconfigured", {
      requestId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return problem(500, "The server is not configured correctly.", requestId);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return problem(415, "Expected application/json.", requestId);
  }

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    log("warn", "agent.proxy.rejected", { requestId, reason: "body_too_large" });
    return problem(413, "Request body is too large.", requestId);
  }

  // One controller for two independent reasons to give up: the client went
  // away, or the backend never answered. Both must cancel the upstream request
  // so a closed tab does not leave a socket and a graph run alive behind it.
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());
  const connectTimer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl, {
      method: "POST",
      // Only the headers the backend needs. Client headers are NOT forwarded:
      // anything else the browser sends is not ours to relay to an internal host.
      headers: {
        "content-type": "application/json",
        // The AG-UI encoder picks its wire format from Accept.
        accept: req.headers.get("accept") ?? "text/event-stream",
        "x-request-id": requestId,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const clientGone = req.signal.aborted;
    log(clientGone ? "info" : "error", "agent.proxy.unreachable", {
      requestId,
      backendUrl,
      clientGone,
      durationMs: Date.now() - startedAt,
      reason: err instanceof Error ? err.message : String(err),
    });
    // The backend URL is in the log, never in the response. In development it
    // is echoed back, because there the reader and the operator are the same
    // person and "fetch failed" has sent people hunting in the wrong process.
    return problem(
      502,
      isDev ? `Could not reach the agent at ${backendUrl}.` : "The agent is unavailable.",
      requestId,
    );
  } finally {
    // Headers are in. The connect clock stops; the client-disconnect wiring
    // stays live for the whole stream.
    clearTimeout(connectTimer);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    log("error", "agent.proxy.upstream_error", {
      requestId,
      status: upstream.status,
      durationMs: Date.now() - startedAt,
      detail: detail.slice(0, 500),
    });
    return problem(502, "The agent returned an error.", requestId);
  }

  log("info", "agent.proxy.streaming", {
    requestId,
    status: upstream.status,
    ttfbMs: Date.now() - startedAt,
  });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
      // no-transform matters as much as no-cache: a compressing proxy will
      // happily buffer an event stream to get a better ratio.
      "cache-control": "no-cache, no-transform",
      // nginx and most enterprise ingresses buffer SSE unless told not to.
      "x-accel-buffering": "no",
      "x-request-id": requestId,
    },
  });
}

/**
 * One error shape for every failure, carrying the correlation id and nothing
 * about the internals. The user gets something to quote; the log has the cause.
 */
function problem(status: number, message: string, requestId: string): Response {
  return Response.json(
    { error: message, requestId },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
