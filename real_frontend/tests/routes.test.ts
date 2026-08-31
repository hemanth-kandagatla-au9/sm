import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The two proxies, tested as functions.
 *
 * These were verified on the wire in Steps 1 and 5, against a logging upstream —
 * which proved they worked that day. This is the regression net: the allow-list
 * in particular is one careless refactor away from becoming a path passthrough,
 * and nothing about that change would look wrong in review.
 *
 * `fetch` is stubbed so the upstream URL each handler *builds* can be asserted.
 * What reaches the backend is exactly what matters here.
 */
process.env.AGUI_BACKEND_URL = "http://backend.internal:8084/copilotkit";
process.env.AGUI_API_BASE = "http://backend.internal:8084";

const { GET: lookup } = await import("@/app/api/lookup/[resource]/route");
const { POST: agent } = await import("@/app/api/agent/route");

function jsonRequest(url: string, body: unknown, contentType = "application/json") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function stubFetch(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

const okJson = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("the lookup proxy", () => {
  const params = (resource: string) => ({ params: Promise.resolve({ resource }) });

  it("forwards an allow-listed resource to its fixed upstream path", async () => {
    const fetchSpy = stubFetch(okJson());

    const res = await lookup(
      new NextRequest("http://localhost/api/lookup/target-systems?platform=SAP"),
      params("target-systems"),
    );

    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "http://backend.internal:8084/api/target-systems?platform=SAP",
    );
  });

  /**
   * The reason this route is an allow-list. A path passthrough would hand any
   * visitor a GET primitive against an internal host.
   */
  it.each([
    "actuator/env",
    "..",
    "../admin",
    "internal",
    "%2e%2e%2fadmin",
    "platforms/../../secret",
  ])("refuses %s without contacting the backend", async (resource) => {
    const fetchSpy = stubFetch(okJson());

    const res = await lookup(
      new NextRequest(`http://localhost/api/lookup/${resource}`),
      params(resource),
    );

    // 404, not 403: a 403 confirms the route exists and is worth probing.
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("drops query parameters that are not on the list", async () => {
    const fetchSpy = stubFetch(okJson());

    await lookup(
      new NextRequest(
        "http://localhost/api/lookup/target-systems?platform=SAP&admin=true&debug=1",
      ),
      params("target-systems"),
    );

    const sent = String(fetchSpy.mock.calls[0]?.[0]);
    expect(sent).toContain("platform=SAP");
    expect(sent).not.toContain("admin");
    expect(sent).not.toContain("debug");
  });

  it("rejects an over-long parameter", async () => {
    const fetchSpy = stubFetch(okJson());

    const res = await lookup(
      new NextRequest(`http://localhost/api/lookup/target-systems?platform=${"x".repeat(300)}`),
      params("target-systems"),
    );

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never caches a Jira lookup, and does cache the static lists", async () => {
    stubFetch(okJson());

    const jira = await lookup(
      new NextRequest("http://localhost/api/lookup/jira-lookup?jira_id=ABC-1"),
      params("jira-lookup"),
    );
    // A ticket can change between reads; a stale pre-fill would put text into a
    // change request that no longer matches its source.
    expect(jira.headers.get("cache-control")).toBe("no-store");

    stubFetch(okJson());
    const platforms = await lookup(
      new NextRequest("http://localhost/api/lookup/platforms"),
      params("platforms"),
    );
    // `private`, because once auth lands a response may be shaped by who asks.
    expect(platforms.headers.get("cache-control")).toMatch(/^private, max-age=\d+$/);
  });

  it("reports an upstream failure without naming the host", async () => {
    stubFetch(okJson()).mockRejectedValue(new Error("ECONNREFUSED backend.internal:8084"));

    const res = await lookup(
      new NextRequest("http://localhost/api/lookup/platforms"),
      params("platforms"),
    );
    const body = (await res.json()) as { error: string; requestId: string };

    expect(res.status).toBe(502);
    expect(body.error).not.toContain("backend.internal");
    expect(body.requestId).toBeTruthy();
  });
});

describe("the agent proxy", () => {
  it("streams an upstream event stream straight through", async () => {
    const upstream = new Response("data: {}\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    stubFetch(upstream);

    const res = await agent(jsonRequest("http://localhost/api/agent", { threadId: "t" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    // A compressing proxy will happily buffer an event stream for a better ratio.
    expect(res.headers.get("cache-control")).toContain("no-transform");
    // nginx and most enterprise ingresses buffer SSE unless told not to.
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  it("rejects a non-JSON body", async () => {
    const fetchSpy = stubFetch(okJson());
    const res = await agent(jsonRequest("http://localhost/api/agent", "hi", "text/plain"));

    expect(res.status).toBe(415);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a body over the cap", async () => {
    const fetchSpy = stubFetch(okJson());
    const res = await agent(
      jsonRequest("http://localhost/api/agent", { pad: "x".repeat(600_000) }),
    );

    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards only the headers the backend needs", async () => {
    const fetchSpy = stubFetch(
      new Response("data: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
    );

    const req = new NextRequest("http://localhost/api/agent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "session=secret",
        authorization: "Bearer leak-me",
        "x-forwarded-for": "10.0.0.1",
      },
      body: "{}",
    });
    await agent(req);

    const sent = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(Object.keys(sent).map((k) => k.toLowerCase()).sort()).toEqual([
      "accept",
      "content-type",
      "x-request-id",
    ]);
  });

  it("keeps a correlation id supplied by the caller", async () => {
    stubFetch(
      new Response("data: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
    );

    const req = new NextRequest("http://localhost/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "from-the-ingress" },
      body: "{}",
    });
    const res = await agent(req);

    expect(res.headers.get("x-request-id")).toBe("from-the-ingress");
  });
});

describe("the readiness probe", () => {
  it("reports ready when the agent host answers", async () => {
    stubFetch(okJson());
    const { GET: ready } = await import("@/app/api/ready/route");

    const res = await ready(new Request("http://localhost/api/ready"));
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ready");
  });

  it("reports not ready without naming the dependency's failure", async () => {
    stubFetch(okJson()).mockRejectedValue(new Error("ECONNREFUSED backend.internal:8084"));
    const { GET: ready } = await import("@/app/api/ready/route");

    const res = await ready(new Request("http://localhost/api/ready"));
    const body = (await res.json()) as { status: string; requestId: string };

    // 503 removes the instance from rotation; it does NOT restart it.
    expect(res.status).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(JSON.stringify(body)).not.toContain("backend.internal");
    expect(body.requestId).toBeTruthy();
  });

  it("stays up when liveness is asked during a dependency outage", async () => {
    stubFetch(okJson()).mockRejectedValue(new Error("down"));
    const { GET: health } = await import("@/app/api/health/route");

    // The whole point of separating the two: a dependency outage must not make
    // liveness fail, or the orchestrator restarts healthy pods.
    const res = health();
    expect(res.status).toBe(200);
  });
});
