/**
 * GET /api/ready — readiness.
 *
 * "Should this instance receive traffic?" — a different question from
 * `/api/health`'s "is this process alive?", and the difference matters
 * operationally.
 *
 * A **liveness** probe that checks dependencies makes an orchestrator restart
 * healthy instances during someone else's outage: a brief upstream blip becomes
 * a fleet-wide restart loop, and recovery takes longer than the original fault.
 * So `/api/health` checks nothing but itself.
 *
 * A **readiness** probe is where a dependency check belongs. Failing it takes an
 * instance out of the load-balancer rotation without killing it, and it returns
 * on its own when the dependency recovers.
 *
 * ── What it checks, and what it deliberately does not ───────────────────────
 * It obtains an Azure AD token, which proves configuration is valid and the
 * identity provider is reachable. It does **not** invoke the AgentCore runtime.
 *
 * Invoking the agent would start a graph run, bill a model call and create a
 * checkpoint, every few seconds, forever. A readiness probe that costs money and
 * mutates state is worse than no readiness probe. The token is the cheapest
 * signal that carries real information, and it is cached, so a probe every few
 * seconds mints nothing after the first.
 */
import { getAccessToken } from "@/lib/agentcore-token";
import { getServerEnv } from "@/lib/env";
import { log, requestIdFrom } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const requestId = requestIdFrom(req.headers);
  const startedAt = Date.now();

  try {
    // Reading the env first separates "misconfigured" from "provider is down",
    // which are different operational problems with different owners.
    getServerEnv();
  } catch {
    return notReady("configuration", requestId, Date.now() - startedAt);
  }

  try {
    await getAccessToken(requestId);
    return Response.json(
      {
        status: "ready",
        dependencies: { identityProvider: "ok" },
        checkedInMs: Date.now() - startedAt,
      },
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
    { status: "not_ready", dependencies: { identityProvider: "unavailable" }, requestId },
    { status: 503, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
