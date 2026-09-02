/**
 * instrumentation.ts — runs once, when a server instance starts.
 *
 * Configuration is validated here so a misconfigured deployment dies at boot,
 * visibly, instead of starting healthy and failing on a user's first request.
 * A crash loop is a diagnosis; a 500 an hour later is a mystery.
 *
 * The build phase is skipped deliberately: an image is built once and run in
 * many environments, so runtime configuration must not be required at build
 * time. Requiring it there is how configuration ends up baked into images.
 */
import { log } from "@/lib/logger";

export async function register(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Only the Node.js server needs (or can read) this configuration.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertServerEnv } = await import("@/lib/env");

  try {
    const result = assertServerEnv();

    if (result.ok) {
      log("info", "server.started", { nodeEnv: process.env.NODE_ENV ?? "unknown" });
      return;
    }

    /*
     * Development only: `assertServerEnv` throws in production, so reaching here
     * means the app is being run without AgentCore or Azure configuration. That
     * is the normal case when working against the scripted backend at
     * /api/agent/mock, so it warns instead of refusing to start — but it names
     * everything missing, so the eventual 500 from the real proxy is not a
     * surprise.
     */
    log("warn", "server.started_unconfigured", {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      reason: result.reason,
      note: "The real agent proxy will fail until these are set. /api/agent/mock does not need them.",
    });
  } catch (err) {
    log("error", "server.misconfigured", {
      reason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Server-side errors, in the same structured shape as everything else, so an
 * unhandled render failure is greppable next to the proxy's own events.
 */
export function onRequestError(
  err: unknown,
  request: { path: string; method: string },
): void {
  log("error", "server.request_error", {
    path: request.path,
    method: request.method,
    reason: err instanceof Error ? err.message : String(err),
  });
}
