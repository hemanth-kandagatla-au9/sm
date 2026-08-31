import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Tests run under Vitest rather than through Next.
 *
 * Everything worth testing here is a plain module or a React component that
 * takes props: the contract layer, the transcript store, the route handlers and
 * the cards. None of it needs a Next server, and a suite that boots one is a
 * suite people stop running.
 *
 * `.mts` because the config uses ESM syntax; as `.ts` it is loaded as CommonJS
 * and Vite warns on every run. A warning printed on every run is a warning
 * everyone learns to ignore.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    /*
     * The default `forks` pool never starts a worker on this Windows setup — it
     * sits for 60s and reports "Timeout waiting for worker to respond". Threads
     * start immediately. Pinned rather than left to the default so the suite
     * behaves the same on every machine, including the cloud PC.
     */
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * `server-only` throws on import unless the bundler resolves it under the
       * "react-server" condition. That guard is a BUILD-time constraint enforced
       * by Next, which is where it belongs and where it still applies — under
       * Vitest there is no client/server module graph for it to protect, so it
       * resolves to the package's own empty build.
       *
       * Aliased to that file rather than removed from `lib/env.ts`: weakening
       * production code to satisfy a test runner is the wrong direction, and the
       * guard is what keeps the backend host out of the browser bundle.
       */
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
});
