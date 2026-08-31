/**
 * lib/logger.ts — one line of JSON per event.
 *
 * Structured, not prose. A log aggregator can filter `event:"agent.proxy.failed"`
 * or group by `requestId`; it cannot usefully filter
 * "Could not reach the agent at...".
 *
 * Every server log line carries a `requestId`, which is also returned to the
 * browser in the `x-request-id` response header. When a user reports a failure,
 * that one value ties their screenshot to the exact server-side line — without
 * putting the reason for the failure in front of them.
 *
 * No PII, no CR contents, no field values. Identifiers and outcomes only.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in RANK) return RANK[configured];
  return process.env.NODE_ENV === "production" ? RANK.info : RANK.debug;
}

export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  if (RANK[level] < threshold()) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Reuse the id the ingress or the caller already assigned, so one request can
 * be followed across processes. Mint one only when nobody has.
 */
export function requestIdFrom(headers: Headers): string {
  const inbound = headers.get("x-request-id")?.trim();
  // Bounded: an inbound header is attacker-controlled and ends up in logs.
  if (inbound && inbound.length <= 200) return inbound;
  return crypto.randomUUID();
}
