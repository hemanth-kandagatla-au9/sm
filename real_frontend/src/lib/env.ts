/**
 * lib/env.ts — the server's configuration, validated once.
 *
 * `import "server-only"` makes importing this file from a Client Component a
 * BUILD error, not a runtime surprise. That is the whole security property of
 * this module: the backend host cannot reach the browser bundle by accident,
 * because the accident does not compile.
 *
 * Validation is **lazy and memoised**, not evaluated at import time. A container
 * image is built once and run in many environments, so requiring runtime values
 * at build time would mean baking configuration into the image — the thing
 * twelve-factor exists to prevent. `assertServerEnv()` in `instrumentation.ts`
 * runs the same checks at process start, so a misconfigured deployment fails
 * loudly at boot rather than on a user's first request.
 */
import "server-only";

export interface ServerEnv {
  /** AG-UI event stream endpoint on agui_server.py. */
  readonly aguiBackendUrl: string;
  /** Base for the deterministic REST lookups on the same host. */
  readonly aguiApiBase: string;
  /** Build identity, surfaced by /api/health. Supplied by the pipeline. */
  readonly appVersion: string;
  readonly gitSha: string;
}

type Issue = { name: string; problem: string };

/**
 * A URL, not a string. Catches the three mistakes that actually happen:
 * an empty value, a host with no scheme, and a `file:`/`ftp:` typo.
 */
function readUrl(name: string, raw: string | undefined, issues: Issue[]): string {
  const value = raw?.trim();
  if (!value) {
    issues.push({ name, problem: "is missing or empty" });
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    issues.push({
      name,
      problem: `is not an absolute URL (got ${JSON.stringify(value)} — did you omit "http://"?)`,
    });
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    issues.push({ name, problem: `must be http or https (got "${parsed.protocol}")` });
    return "";
  }

  // Normalise once here so no call site has to think about double slashes.
  return value.replace(/\/+$/, "");
}

function readEnv(): ServerEnv {
  const issues: Issue[] = [];

  const env: ServerEnv = {
    aguiBackendUrl: readUrl("AGUI_BACKEND_URL", process.env.AGUI_BACKEND_URL, issues),
    aguiApiBase: readUrl("AGUI_API_BASE", process.env.AGUI_API_BASE, issues),
    appVersion: process.env.APP_VERSION?.trim() || "dev",
    gitSha: process.env.GIT_SHA?.trim() || "unknown",
  };

  // Every problem at once. Reporting one variable per restart turns a
  // two-minute fix into four deploys.
  if (issues.length > 0) {
    const list = issues.map((i) => `  - ${i.name} ${i.problem}`).join("\n");
    throw new Error(
      `Invalid server environment:\n${list}\n\nSee .env.example. Copy it to .env.local for local development.`,
    );
  }

  return Object.freeze(env);
}

let cached: ServerEnv | undefined;

/** The validated environment. Throws on first use if configuration is wrong. */
export function getServerEnv(): ServerEnv {
  cached ??= readEnv();
  return cached;
}

/** Called at process start so a bad deployment dies immediately. */
export function assertServerEnv(): void {
  getServerEnv();
}
