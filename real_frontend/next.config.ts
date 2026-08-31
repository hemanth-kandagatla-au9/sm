import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * A Content-Security-Policy is deliberately absent until Step 1, when the
 * agent proxy exists and the real connect-src is known. A CSP written before
 * the sources are known is either wrong or so loose it means nothing.
 */
const securityHeaders = [
  // The app is never a frame target: no clickjacking surface.
  { key: "X-Frame-Options", value: "DENY" },
  // No MIME sniffing — a JSON response can never be executed as a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Do not leak CR identifiers or Jira keys in the Referer to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app needs none of these; denying them shrinks the attack surface.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Surfaces effect/lifecycle bugs in development by double-invoking. Costs
  // nothing in production, where it is inert.
  reactStrictMode: true,

  // Do not advertise the framework and version to a scanner.
  poweredByHeader: false,

  // NOTE: `output: "standalone"` is deliberately NOT set yet.
  //
  // It was set in Step 0 and removed here. Running `next start` against it
  // prints "does not work with output: standalone" and the documented
  // invocation (`node .next/standalone/server.js`) additionally requires
  // copying `public/` and `.next/static/` into the standalone directory —
  // steps that belong to a Dockerfile that does not exist yet. A build flag
  // whose deployment procedure is missing is a trap for the next person who
  // types `npm start`. It returns in Step 9, with the container that performs
  // those copies.

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
