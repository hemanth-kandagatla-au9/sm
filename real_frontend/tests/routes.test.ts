import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The agent proxy, tested as a function.
 *
 * `fetch` is stubbed throughout, so **no test here contacts AWS or Azure**. What
 * is asserted is the request the route *builds*: the URL, the headers, the
 * bearer token, and the session id. That is exactly the part that has to be
 * right, and it is the part nobody can check by reading.
 *
 * The token module keeps module-level state, so it is reset between tests.
 */
process.env.AGENTCORE_RUNTIME_ENDPOINT_ARN =
  "arn:aws:bedrock-agentcore:us-east-1:111122223333:runtime/crco_test-abc123/runtime-endpoint/DEFAULT";
process.env.AZURE_TENANT_ID = "tenant-guid";
process.env.AZURE_CLIENT_ID = "client-guid";
process.env.AZURE_CLIENT_SECRET = "shhh";

const { POST: agent } = await import("@/app/api/agent/route");
const { __resetTokenCacheForTests } = await import("@/lib/agentcore-token");

const TOKEN_URL = "https://login.microsoftonline.com/tenant-guid/oauth2/v2.0/token";
const INVOKE_HOST = "https://bedrock-agentcore.us-east-1.amazonaws.com";

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const tokenResponse = (accessToken = "tok-123", expiresIn = 3600) =>
  new Response(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const sseResponse = (status = 200) =>
  new Response("data: {}\n\n", {
    status,
    headers: { "content-type": "text/event-stream" },
  });

/**
 * Routes both calls the proxy makes: the token mint and the invocation. Returns
 * the spy so tests can assert on either.
 */
function stubUpstreams(invoke: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(TOKEN_URL)) return Promise.resolve(tokenResponse());
    return Promise.resolve(invoke());
  });
}

type FetchCall = [unknown, RequestInit | undefined];

/** The invocation call, ignoring the token call. */
function invocationCall(spy: { mock: { calls: unknown[][] } }): FetchCall | undefined {
  return spy.mock.calls.find((c) => String(c[0]).startsWith(INVOKE_HOST)) as
    | FetchCall
    | undefined;
}

/** The headers the route built for the invocation. Fails loudly if absent. */
function invocationHeaders(spy: { mock: { calls: unknown[][] } }): Record<string, string> {
  const call = invocationCall(spy);
  if (!call) throw new Error("the route never called the AgentCore endpoint");
  return call[1]?.headers as Record<string, string>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  __resetTokenCacheForTests();
});

describe("the AgentCore invocation URL", () => {
  it("is built from the endpoint ARN, with the ARN url-encoded", async () => {
    const spy = stubUpstreams(() => sseResponse());
    await agent(jsonRequest({ threadId: "t-1" }));

    const url = String(invocationCall(spy)?.[0]);
    // The region comes out of the ARN, not a second variable.
    expect(url).toContain("https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/");
    // Colons and slashes in the ARN are path separators unless encoded.
    expect(url).toContain(encodeURIComponent("arn:aws:bedrock-agentcore:us-east-1"));
    expect(url).not.toContain("/runtime-endpoint/");
    expect(url).toContain("qualifier=DEFAULT");
  });
});

describe("authentication", () => {
  it("mints a bearer token and sends it", async () => {
    const spy = stubUpstreams(() => sseResponse());
    await agent(jsonRequest({ threadId: "t-1" }));

    const tokenCall = spy.mock.calls.find((c) => String(c[0]).startsWith(TOKEN_URL));
    expect(tokenCall, "no token was requested").toBeDefined();
    expect(String((tokenCall?.[1] as RequestInit).body)).toContain("grant_type=client_credentials");

    expect(invocationHeaders(spy).authorization).toBe("Bearer tok-123");
  });

  it("reuses the cached token across requests", async () => {
    const spy = stubUpstreams(() => sseResponse());

    await agent(jsonRequest({ threadId: "t-1" }));
    await agent(jsonRequest({ threadId: "t-1" }));

    const tokenCalls = spy.mock.calls.filter((c) => String(c[0]).startsWith(TOKEN_URL));
    // Client-credentials tokens last about an hour. Minting per request would
    // double every round trip and get rate limited.
    expect(tokenCalls).toHaveLength(1);
  });

  it("mints only one token for concurrent cold requests", async () => {
    const spy = stubUpstreams(() => sseResponse());

    await Promise.all([
      agent(jsonRequest({ threadId: "t-1" })),
      agent(jsonRequest({ threadId: "t-2" })),
      agent(jsonRequest({ threadId: "t-3" })),
    ]);

    const tokenCalls = spy.mock.calls.filter((c) => String(c[0]).startsWith(TOKEN_URL));
    // Without single-flight this is three. A page that opens with parallel
    // lookups would mint a token for each one.
    expect(tokenCalls).toHaveLength(1);
  });

  /**
   * A token Azure considers valid can still be refused by the runtime: a
   * rotated secret, a reconfigured authorizer. Without invalidation the process
   * serves 401s until someone restarts it.
   */
  it("drops the cached token and retries once on a 401", async () => {
    let invocations = 0;
    const spy = stubUpstreams(() => {
      invocations += 1;
      return invocations === 1 ? new Response("unauthorized", { status: 401 }) : sseResponse();
    });

    const res = await agent(jsonRequest({ threadId: "t-1" }));

    expect(res.status).toBe(200);
    expect(invocations).toBe(2);
    const tokenCalls = spy.mock.calls.filter((c) => String(c[0]).startsWith(TOKEN_URL));
    expect(tokenCalls).toHaveLength(2);
  });

  /**
   * Two attempts, then stop. A loop here would hammer both Azure and AWS while
   * every browser request hangs.
   *
   * The browser gets 502, not 401. A persistent 401 means OUR credentials are
   * not acceptable to the runtime — a rotated secret or a reconfigured
   * authorizer — which is a server-side fault. Passing 401 through would tell
   * the browser that the USER is unauthenticated, and in a host application
   * that wraps this one, that is what triggers a login redirect. The user would
   * be bounced to a sign-in page to fix a misconfigured client secret.
   */
  it("does not retry forever, and reports a server fault rather than a user one", async () => {
    let invocations = 0;
    stubUpstreams(() => {
      invocations += 1;
      return new Response("unauthorized", { status: 401 });
    });

    const res = await agent(jsonRequest({ threadId: "t-1" }));

    expect(invocations).toBe(2);
    expect(res.status).toBe(502);
  });

  it("reports a token failure without leaking the secret", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith(TOKEN_URL)) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }),
        );
      }
      return Promise.resolve(sseResponse());
    });

    const res = await agent(jsonRequest({ threadId: "t-1" }));
    const body = JSON.stringify(await res.json());

    expect(res.status).toBe(502);
    expect(body).not.toContain("shhh");
    expect(body).toContain("requestId");
  });
});

describe("the runtime session id", () => {
  /**
   * AWS requires at least 33 characters, and the graph's checkpoint is keyed on
   * it, so it must be stable across a conversation's turns.
   */
  it("is derived from threadId and padded to 33 characters", async () => {
    const spy = stubUpstreams(() => sseResponse());
    await agent(jsonRequest({ threadId: "t-short" }));

    const sessionId = invocationHeaders(spy)["x-amzn-bedrock-agentcore-runtime-session-id"] ?? "";

    expect(sessionId.length).toBeGreaterThanOrEqual(33);
    expect(sessionId.startsWith("t-short")).toBe(true);
  });

  it("stays the same for the same thread across turns", async () => {
    const spy = stubUpstreams(() => sseResponse());

    await agent(jsonRequest({ threadId: "t-stable" }));
    await agent(jsonRequest({ threadId: "t-stable", forwardedProps: { command: { resume: "x" } } }));

    const ids = (spy.mock.calls as FetchCall[])
      .filter((c) => String(c[0]).startsWith(INVOKE_HOST))
      .map(
        (c) =>
          (c[1]?.headers as Record<string, string>)[
            "x-amzn-bedrock-agentcore-runtime-session-id"
          ],
      );

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("still produces a valid id when the body is malformed", async () => {
    const spy = stubUpstreams(() => sseResponse());
    await agent(jsonRequest("{ not json"));

    const sessionId =
      invocationHeaders(spy)["x-amzn-bedrock-agentcore-runtime-session-id"] ?? "";
    expect(sessionId.length).toBeGreaterThanOrEqual(33);
  });
});

describe("streaming and guards", () => {
  it("pipes the event stream through untouched", async () => {
    stubUpstreams(() => sseResponse());
    const res = await agent(jsonRequest({ threadId: "t-1" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    // A compressing proxy will happily buffer an event stream for a better ratio.
    expect(res.headers.get("cache-control")).toContain("no-transform");
    // nginx and most enterprise ingresses buffer SSE unless told not to.
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  /**
   * The same endpoint answers `forwardedProps.lookup` requests with JSON. If the
   * proxy forced text/event-stream, every lookup would break.
   */
  it("forwards a JSON content type unchanged, for lookups", async () => {
    stubUpstreams(
      () =>
        new Response(JSON.stringify({ target_systems: ["ECP"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const res = await agent(
      jsonRequest({ threadId: "lookup-1", forwardedProps: { lookup: { type: "platforms" } } }, {
        accept: "application/json",
      }),
    );

    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ target_systems: ["ECP"] });
  });

  it("rejects a non-JSON body", async () => {
    const spy = stubUpstreams(() => sseResponse());
    const res = await agent(jsonRequest("hi", { "content-type": "text/plain" }));

    expect(res.status).toBe(415);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a body over the cap", async () => {
    const spy = stubUpstreams(() => sseResponse());
    const res = await agent(jsonRequest({ pad: "x".repeat(600_000) }));

    expect(res.status).toBe(413);
    expect(spy).not.toHaveBeenCalled();
  });

  it("forwards only the headers the runtime needs", async () => {
    const spy = stubUpstreams(() => sseResponse());

    await agent(
      jsonRequest(
        { threadId: "t-1" },
        { cookie: "session=secret", authorization: "Bearer leak-me", "x-forwarded-for": "10.0.0.1" },
      ),
    );

    const headers = invocationHeaders(spy);
    expect(Object.keys(headers).map((k) => k.toLowerCase()).sort()).toEqual([
      "accept",
      "authorization",
      "content-type",
      "x-amzn-bedrock-agentcore-runtime-session-id",
      "x-request-id",
    ]);
    // The browser's Authorization header must never survive: ours replaces it.
    expect(headers.authorization).not.toBe("Bearer leak-me");
  });

  it("keeps a correlation id supplied by the caller", async () => {
    stubUpstreams(() => sseResponse());
    const res = await agent(jsonRequest({ threadId: "t-1" }, { "x-request-id": "from-the-ingress" }));

    expect(res.headers.get("x-request-id")).toBe("from-the-ingress");
  });

  it("reports an upstream failure without naming the runtime", async () => {
    stubUpstreams(() => new Response("boom", { status: 500 }));

    const res = await agent(jsonRequest({ threadId: "t-1" }));
    const body = JSON.stringify(await res.json());

    expect(res.status).toBe(502);
    expect(body).not.toContain("arn:aws");
    expect(body).toContain("requestId");
  });
});

describe("health and readiness", () => {
  it("keeps liveness at 200 while the dependency is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    const { GET: health } = await import("@/app/api/health/route");

    // The whole point of separating the two: a dependency outage must not make
    // liveness fail, or the orchestrator restarts healthy pods.
    expect(health().status).toBe(200);
  });

  it("reports ready when a token can be obtained", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    const { GET: ready } = await import("@/app/api/ready/route");

    const res = await ready(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ready");
  });

  /**
   * Readiness deliberately does not invoke the runtime: that would start a graph
   * run, bill a model call and write a checkpoint, every few seconds forever.
   */
  it("does not invoke the agent runtime", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(tokenResponse());
    const { GET: ready } = await import("@/app/api/ready/route");

    await ready(new Request("http://localhost/api/ready"));

    expect(spy.mock.calls.some((c) => String(c[0]).startsWith(INVOKE_HOST))).toBe(false);
  });

  it("reports not ready without naming the failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED login.microsoftonline.com"));
    const { GET: ready } = await import("@/app/api/ready/route");

    const res = await ready(new Request("http://localhost/api/ready"));
    const body = JSON.stringify(await res.json());

    expect(res.status).toBe(503);
    expect(body).not.toContain("microsoftonline");
    expect(body).toContain("requestId");
  });
});
