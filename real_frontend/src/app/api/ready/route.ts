/**
 * GET /api/ready — readiness.
 *
 * "Should this instance receive traffic?" — which is a different question from
 * `/api/health`'s "is this process alive?", and the difference matters
 * operationally.
 *
 * A **liveness** probe that checks dependencies makes an orchestrator restart
 * healthy instances during someone else's outage: a brief backend blip becomes a
 * fleet-wide restart loop, and recovery takes longer than the original fault.
 * So `/api/health` checks nothing but itself.
 *
 * A **readiness** probe is where a dependency check belongs. Failing it takes an
 * instance out of the load-balancer rotation without killing it, and it returns
 * on its own when the dependency recovers. Nothing restarts, nothing loses its
 * warm state, and traffic stops going somewhere that cannot serve it.
 *
 * The check is a HEAD-like probe of the agent host, not a graph run: readiness
 * must be cheap enough to answer every few seconds, and must not wake an agent.
 */
import { getServerEnv } from "@/lib/env";
import { log, requestIdFrom } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Deliberately short. A readiness probe that takes longer than the interval
 * between probes stacks up, and the pile-up looks like the outage it was meant
 * to detect.
 */
const PROBE_TIMEOUT_MS = 3_000;

export async function GET(req: Request): Promise<Response> {
  const requestId = requestIdFrom(req.headers);
  const startedAt = Date.now();

  let apiBase: string;
  try {
    apiBase = getServerEnv().aguiApiBase;
  } catch {
    // Unreachable while `instrumentation.ts` validates at boot — a misconfigured
    // process never starts. Handled anyway: readiness must answer, always.
    return notReady("configuration", requestId, Date.now() - startedAt);
  }

  try {
    const res = await fetch(new URL("/api/platforms", apiBase), {
      // The cheapest endpoint the backend exposes, used as a liveness signal for
      // it rather than for its contents.
      method: "GET",
      headers: { accept: "application/json", "x-request-id": requestId },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) return notReady(`upstream ${res.status}`, requestId, Date.now() - startedAt);

    return Response.json(
      { status: "ready", dependencies: { agent: "ok" }, checkedInMs: Date.now() - startedAt },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (err) {
    return notReady(
      err instanceof Error ? err.message : String(err),
      requestId,
      Date.now() - startedAt,
    );
  }
}

function notReady(reason: string, requestId: string, tookMs: number): Response {
  log("warn", "ready.not_ready", { requestId, reason, tookMs });

  return Response.json(
    // The reason stays out of the body: this endpoint is reachable by anything
    // that can route to the pod, and "which dependency is down" is not a fact to
    // publish. The log line has it.
    { status: "not_ready", dependencies: { agent: "unavailable" }, requestId },
    { status: 503, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
