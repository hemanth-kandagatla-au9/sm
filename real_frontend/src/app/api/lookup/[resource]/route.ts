/**
 * GET /api/lookup/<resource> — server-side proxy for the deterministic REST
 * lookups that `agui_server.py` exposes alongside the agent stream.
 *
 * These are the dropdown and pre-fill endpoints the graph does not need to be
 * woken up for: platforms, target systems, templates, Jira pre-fill.
 *
 * ── Why this is an ALLOW-LIST and not a path passthrough ─────────────────────
 * The obvious shape for this file is `/api/lookup/[...path]` forwarding whatever
 * it receives. That would hand any visitor a GET primitive against an internal
 * host: `/api/lookup/../admin`, `/api/lookup/actuator/env`, or simply a way to
 * enumerate what else lives on that server. It is server-side request forgery
 * with a friendly URL.
 *
 * So four resources are named here, each mapped to a fixed upstream path with a
 * fixed set of permitted query parameters. Anything else is a 404 — not a 403,
 * which would confirm that the route exists.
 *
 * The browser therefore reaches exactly four upstream URLs, all of them written
 * in this file.
 */
import type { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { log, requestIdFrom } from "@/lib/logger";

export const runtime = "nodejs";

interface Resource {
  /** Fixed upstream path. Never derived from the request. */
  readonly path: string;
  /** Query parameters permitted through. Everything else is dropped. */
  readonly params: readonly string[];
  /**
   * Browser cache lifetime. `private` because a response can be shaped by who
   * is asking once auth lands, and a shared cache must not serve one user's
   * lookup to another.
   */
  readonly cacheSeconds: number;
}

const RESOURCES: Record<string, Resource> = {
  platforms: { path: "/api/platforms", params: [], cacheSeconds: 300 },
  "target-systems": { path: "/api/target-systems", params: ["platform"], cacheSeconds: 300 },
  templates: { path: "/api/templates", params: ["platform"], cacheSeconds: 300 },
  // Never cached: a Jira ticket can change between two reads, and a stale
  // pre-fill would put text into a change request that no longer matches source.
  "jira-lookup": { path: "/api/jira-lookup", params: ["jira_id"], cacheSeconds: 0 },
};

/** Long enough for any real value, short enough not to be a payload. */
const MAX_PARAM_LENGTH = 200;

const TIMEOUT_MS = 10_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<Response> {
  const requestId = requestIdFrom(req.headers);
  const { resource: name } = await params;

  const resource = RESOURCES[name];
  if (!resource) {
    // 404, not 403: a 403 confirms the route exists and is worth probing.
    log("warn", "lookup.unknown_resource", { requestId, resource: name });
    return problem(404, "Not found.", requestId);
  }

  let base: string;
  try {
    base = getServerEnv().aguiApiBase;
  } catch (err) {
    log("error", "lookup.misconfigured", {
      requestId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return problem(500, "The server is not configured correctly.", requestId);
  }

  // Built from the fixed path, then only the named parameters are copied across.
  // The incoming query string is never forwarded wholesale.
  const upstream = new URL(resource.path, base);
  for (const key of resource.params) {
    const value = req.nextUrl.searchParams.get(key);
    if (value == null) continue;
    if (value.length > MAX_PARAM_LENGTH) {
      return problem(400, `Parameter "${key}" is too long.`, requestId);
    }
    upstream.searchParams.set(key, value);
  }

  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(upstream, {
      headers: { accept: "application/json", "x-request-id": requestId },
      signal: controller.signal,
    });

    if (!res.ok) {
      log("warn", "lookup.upstream_error", { requestId, resource: name, status: res.status });
      return problem(502, "The lookup service returned an error.", requestId);
    }

    const body = await res.text();

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control":
          resource.cacheSeconds > 0
            ? `private, max-age=${resource.cacheSeconds}`
            : "no-store",
        "x-request-id": requestId,
      },
    });
  } catch (err) {
    const clientGone = req.signal.aborted;
    log(clientGone ? "info" : "error", "lookup.unreachable", {
      requestId,
      resource: name,
      // The resolved URL goes to the log, never to the browser.
      upstream: upstream.toString(),
      clientGone,
      reason: err instanceof Error ? err.message : String(err),
    });
    return problem(502, "The lookup service is unavailable.", requestId);
  } finally {
    clearTimeout(timer);
  }
}

function problem(status: number, message: string, requestId: string): Response {
  return Response.json(
    { error: message, requestId },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
