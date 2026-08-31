import { connection } from "next/server";
import { CrCoApp } from "./CrCoApp";

/**
 * A Server Component whose only job is to keep this route dynamic.
 *
 * The nonce-based CSP requires it. A nonce must be unique per request, and a
 * page prerendered at build time has no request to take one from — so Next
 * cannot stamp its script tags, and `script-src 'self' 'nonce-…'` then blocks
 * every one of them. The page loads no JavaScript at all and renders blank.
 *
 * This was not theoretical: making the page a Client Component turned the route
 * static again, and a production build served 12 script tags with 0 nonces. The
 * CSP header is set by the proxy either way, so nothing warns about it — the
 * page simply stops working.
 *
 * `connection()` is what forces the route to wait for a request. It has to live
 * in a Server Component, which is why the interactive half is a separate file.
 */
export default async function Home() {
  await connection();
  return <CrCoApp />;
}
