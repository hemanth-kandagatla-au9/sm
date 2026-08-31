/**
 * GET /api/health — liveness.
 *
 * "Is this process able to serve?" and nothing more. It deliberately does NOT
 * check the agent backend.
 *
 * A liveness probe that fails when a dependency is down causes the orchestrator
 * to restart healthy instances during someone else's outage — a brief backend
 * blip becomes a cascading restart loop across the fleet, and recovery is now
 * slower than the original fault. Readiness ("should traffic be routed here?")
 * is the probe that may consider dependencies, and it belongs in a separate
 * endpoint added when there is a load balancer to consume it.
 *
 * Returns build identity so a running pod can be tied to a commit without
 * guessing which deployment is live.
 */
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  let version = "dev";
  let commit = "unknown";

  // Defence in depth, and honest about its reach: with `instrumentation.ts`
  // validating at boot, a misconfigured process never starts, so `configured:
  // false` is not reachable through that path — the orchestrator sees a crash
  // loop instead, which is the louder signal. This guard exists so that health
  // can never itself be the thing that throws.
  let configured = true;
  try {
    const env = getServerEnv();
    version = env.appVersion;
    commit = env.gitSha;
  } catch {
    configured = false;
  }

  return Response.json(
    {
      status: "ok",
      configured,
      version,
      commit,
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
