/**
 * proxy.ts — per-request Content-Security-Policy with a nonce.
 *
 * (In Next 16 this file is what earlier versions called `middleware.ts`.)
 *
 * The CSP was deliberately left out of Step 0. It is written now because the
 * app's real network shape is finally known, and it turns out to be the
 * strictest one available:
 *
 *     connect-src 'self'
 *
 * The browser talks to `/api/agent` and nothing else. Every backend call goes
 * through the server-side proxy, so no external origin needs to be allow-listed
 * — and an injected script cannot exfiltrate a draft CR to an attacker's host,
 * because the policy permits no such destination.
 *
 * ── Why a nonce rather than 'unsafe-inline' ──────────────────────────────────
 * Next.js emits inline bootstrap scripts (the hydration payload). Permitting
 * them with 'unsafe-inline' would also permit any script an attacker manages to
 * inject into the page, which is most of what a CSP is for. A nonce is a fresh
 * random value per request: Next reads it from this header and stamps it onto
 * its own scripts, so they run and nothing else does.
 *
 * 'strict-dynamic' lets those trusted scripts load the chunks they need without
 * this file having to enumerate every bundle URL — a list that would be wrong
 * by the next build.
 *
 * ── The cost, stated plainly ────────────────────────────────────────────────
 * A nonce must differ per request, so pages carrying one cannot be prerendered
 * to static HTML. This app gives up static optimisation of its pages. That is
 * an acceptable trade here — the surface is an authenticated, per-user agent
 * session that was never going to be cached at an edge — but it is a real cost
 * and it is the reason `page.tsx` opts into dynamic rendering explicitly.
 */
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const directives = [
    // Nothing loads from anywhere unless a directive below says otherwise.
    `default-src 'self'`,

    // 'unsafe-eval' in development only: React uses eval to rebuild server-side
    // error stacks in the browser, and Turbopack's HMR needs it. Neither React
    // nor Next uses eval in a production build.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,

    // Production serves compiled Tailwind as a file from this origin. In
    // development the styles are injected inline by the dev server before any
    // nonce could be attached, so they are permitted there and nowhere else.
    `style-src 'self'${isDev ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,

    // data: and blob: cover inline SVG icons and anything generated client-side.
    `img-src 'self' data: blob:`,

    // The Johnson faces are served from this origin. No font CDN.
    `font-src 'self'`,

    // The whole point: the page can only call back to this origin. ws: is the
    // development hot-reload socket.
    `connect-src 'self'${isDev ? " ws:" : ""}`,

    // No plugins, no <base> rewriting, forms cannot post off-origin.
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,

    // Clickjacking, stated twice: this is the modern directive,
    // X-Frame-Options in next.config.ts is the one older proxies understand.
    `frame-ancestors 'none'`,
  ];

  if (!isDev) directives.push("upgrade-insecure-requests");

  const csp = directives.join("; ");

  // The nonce reaches the renderer through the REQUEST headers — that is how
  // Next finds it and stamps its own script tags. Setting it only on the
  // response would produce a policy that blocks the page's own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      /*
       * Documents only.
       *
       * - `api`      responses are JSON and SSE; a CSP on them means nothing,
       *              and running this on the agent stream would add work to
       *              every request for no security gain.
       * - `_next/*`  build output and optimised images, served from this origin.
       * - prefetches carry no document to apply a policy to.
       */
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
