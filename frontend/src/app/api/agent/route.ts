/**
 * POST /api/agent — same-origin proxy to the backend's AG-UI endpoint.
 *
 * The browser talks to this route; this route streams to `agui_server.py`. Three
 * reasons it exists rather than the browser calling :8084 directly:
 *
 *   1. **CORS.** `agui_server.py` allows only `:8005` and an origin regex for
 *      that port. Rather than ask the backend team to widen it for every dev
 *      port, same-origin sidesteps it entirely.
 *   2. **Credentials.** When auth lands, the token is attached here, server-side,
 *      instead of being readable in the browser.
 *   3. **It replaces the bridge.** The backend team ran a third Node process on
 *      :8006 to translate CopilotKit's GraphQL into AG-UI. Speaking AG-UI
 *      natively (DECISIONS.md D24) reduces that to this pass-through.
 *
 * The response body is piped straight through — no buffering, or the SSE stream
 * would not be a stream.
 */
import { NextRequest } from "next/server";

/** Never prerender or cache: this is a live event stream. */
export const dynamic = "force-dynamic";

const BACKEND =
  process.env.AGUI_BACKEND_URL ?? "http://localhost:8084/copilotkit";

export async function POST(req: NextRequest) {
  let upstream: Response;

  try {
    upstream = await fetch(BACKEND, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The encoder picks its format from Accept; it answers text/event-stream.
        accept: req.headers.get("accept") ?? "text/event-stream",
      },
      body: await req.text(),
      // Node needs this to stream a request body rather than buffer it.
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  } catch (err) {
    // A dead backend is the single most likely failure in local dev. Say which
    // URL failed — "fetch failed" on its own has sent people hunting in the
    // wrong process more than once.
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Could not reach the agent at ${BACKEND} — ${message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: `Agent returned ${upstream.status} ${upstream.statusText}`, detail: detail.slice(0, 500) },
      { status: upstream.status === 200 ? 502 : upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx and friends buffer SSE unless told not to.
      "x-accel-buffering": "no",
    },
  });
}
