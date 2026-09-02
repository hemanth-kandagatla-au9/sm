/**
 * lib/env.ts — the server's configuration, validated once.
 *
 * `import "server-only"` makes importing this file from a Client Component a
 * BUILD error, not a runtime surprise. That matters more here than it used to:
 * this module now holds an OAuth client secret, and the accident that would
 * leak it is one careless import away in a codebase without that guard.
 *
 * Validation is **lazy and memoised**, not evaluated at import time. A container
 * image is built once and run in many environments, so requiring runtime values
 * at build time would mean baking configuration into the image — the thing
 * twelve-factor exists to prevent. `assertServerEnv()` in `instrumentation.ts`
 * runs the same checks at process start.
 *
 * ── The backend is AWS Bedrock AgentCore ────────────────────────────────────
 * Not a local `agui_server.py`. The runtime is configured with a JWT/OAuth
 * inbound authorizer rather than the IAM (SigV4) default, so the call is a plain
 * HTTPS POST carrying an Azure AD bearer token. AWS SDKs cannot sign OAuth
 * calls, which is why no AWS SDK appears anywhere in this app.
 */
import "server-only";

export interface ServerEnv {
  /** Full data-plane URL, derived from the endpoint ARN. */
  readonly invokeUrl: string;
  /** The runtime ARN without the qualifier. Logged, never returned to a browser. */
  readonly runtimeArn: string;
  readonly qualifier: string;
  readonly region: string;

  /** Azure AD client-credentials configuration for the bearer token. */
  readonly azure: {
    readonly tenantId: string;
    readonly clientId: string;
    /** Never logged, never serialised, never returned in a response. */
    readonly clientSecret: string;
    readonly scope: string;
    readonly tokenUrl: string;
  };

  /** Build identity, surfaced by /api/health. Supplied by the pipeline. */
  readonly appVersion: string;
  readonly gitSha: string;
}

type Issue = { name: string; problem: string };

function readString(name: string, raw: string | undefined, issues: Issue[]): string {
  const value = raw?.trim();
  if (!value) {
    issues.push({ name, problem: "is missing or empty" });
    return "";
  }
  return value;
}

/**
 * The ARN we are given combines the runtime and its endpoint qualifier:
 *
 *   arn:aws:bedrock-agentcore:<region>:<account>:runtime/<name>/runtime-endpoint/<qualifier>
 *
 * The invocation URL needs them apart, and the region comes out of the ARN
 * rather than a second variable — two sources for one fact is how they end up
 * disagreeing.
 */
function parseEndpointArn(
  raw: string | undefined,
  issues: Issue[],
): { runtimeArn: string; qualifier: string; region: string } {
  const value = readString("AGENTCORE_RUNTIME_ENDPOINT_ARN", raw, issues);
  if (!value) return { runtimeArn: "", qualifier: "", region: "" };

  // `split` is typed as possibly-undefined per element under
  // noUncheckedIndexedAccess, which is correct: a caller could pass anything.
  const separator = "/runtime-endpoint/";
  const cut = value.indexOf(separator);
  const runtimeArn = cut === -1 ? value : value.slice(0, cut);
  const qualifier = cut === -1 ? "DEFAULT" : value.slice(cut + separator.length) || "DEFAULT";

  const parts = runtimeArn.split(":");
  const region = parts[3] ?? "";

  if (parts[0] !== "arn" || parts[2] !== "bedrock-agentcore" || !region) {
    issues.push({
      name: "AGENTCORE_RUNTIME_ENDPOINT_ARN",
      problem: `is not a bedrock-agentcore runtime ARN (got ${JSON.stringify(value.slice(0, 60))})`,
    });
    return { runtimeArn: "", qualifier: "", region: "" };
  }

  return { runtimeArn, qualifier, region };
}

function readEnv(): ServerEnv {
  const issues: Issue[] = [];

  const { runtimeArn, qualifier, region } = parseEndpointArn(
    process.env.AGENTCORE_RUNTIME_ENDPOINT_ARN,
    issues,
  );

  const tenantId = readString("AZURE_TENANT_ID", process.env.AZURE_TENANT_ID, issues);
  const clientId = readString("AZURE_CLIENT_ID", process.env.AZURE_CLIENT_ID, issues);
  const clientSecret = readString("AZURE_CLIENT_SECRET", process.env.AZURE_CLIENT_SECRET, issues);

  // Every problem at once. Reporting one variable per restart turns a
  // two-minute fix into four deploys.
  if (issues.length > 0) {
    const list = issues.map((i) => `  - ${i.name} ${i.problem}`).join("\n");
    throw new Error(
      `Invalid server environment:\n${list}\n\nSee .env.example. Copy it to .env.local for local development.`,
    );
  }

  return Object.freeze({
    // The ARN is URL-encoded: it contains colons and slashes that are path
    // separators to anything parsing this URL.
    invokeUrl:
      `https://bedrock-agentcore.${region}.amazonaws.com` +
      `/runtimes/${encodeURIComponent(runtimeArn)}/invocations?qualifier=${encodeURIComponent(qualifier)}`,
    runtimeArn,
    qualifier,
    region,
    azure: Object.freeze({
      tenantId,
      clientId,
      clientSecret,
      // `.default` on a v2.0 endpoint carries the audience, so no separate
      // audience parameter is sent.
      scope: process.env.AZURE_TOKEN_SCOPE?.trim() || `api://${clientId}/.default`,
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    }),
    appVersion: process.env.APP_VERSION?.trim() || "dev",
    gitSha: process.env.GIT_SHA?.trim() || "unknown",
  });
}

let cached: ServerEnv | undefined;

/** The validated environment. Throws on first use if configuration is wrong. */
export function getServerEnv(): ServerEnv {
  cached ??= readEnv();
  return cached;
}

/**
 * Called at process start.
 *
 * **Strict in production, advisory in development.** A misconfigured deployment
 * must die at boot, visibly. But development frequently runs against the
 * scripted backend at `/api/agent/mock`, which needs no AWS or Azure
 * configuration at all, and refusing to start without credentials would mean
 * every developer needs production secrets to look at a card.
 *
 * The development path warns loudly and lists exactly what is missing, so the
 * eventual 500 from the real proxy is never a surprise.
 */
export function assertServerEnv(): { ok: boolean; reason?: string } {
  try {
    getServerEnv();
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "production") throw err;
    return { ok: false, reason };
  }
}
