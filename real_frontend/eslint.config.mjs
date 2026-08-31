import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layering is a lint rule, not a convention.
 *
 * Allowed direction:  shell → cards → agent-ui → contract
 *                       ↘      ↓
 *                          ui / lib          (leaves: they import nothing local)
 *
 * `agent-ui/` is the portable deliverable: it must stay importable by any host
 * app, so it may not reach into this app's chrome or routes. `cards/` are pure
 * presentational units: props in, respond() out — they may not reach the shell,
 * the routes, or the transport.
 *
 * `agent-ui/registry.tsx` is the one deliberate exception: it is the composition
 * root that maps contract names to card components, so it must see `cards/`.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    files: ["src/agent-ui/**/*.{ts,tsx}"],
    ignores: ["src/agent-ui/registry.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/shell", "@/shell/*", "@/app", "@/app/*", "@/cards", "@/cards/*"],
              message:
                "agent-ui/ is the portable deliverable. Only registry.tsx may import cards; nothing here may import app chrome or routes.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["src/cards/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/shell", "@/shell/*", "@/app", "@/app/*", "@/agent-ui/useAgentSession"],
              message:
                "Cards are props in, respond() out. They do not know about the shell, the routes, or the transport.",
            },
          ],
        },
      ],
    },
  },

  {
    /*
     * `ui/` and `lib/` are leaves: presentational primitives and helpers that
     * know nothing about this application. Anything above may use them; they
     * may use nothing above.
     *
     * This layer exists because the rule above caught a real coupling on first
     * contact with real code — seven card files imported `Icon` from `shell/`,
     * which would have made the portable half of the app depend on the half
     * that gets replaced. The fix was a leaf, not an exception.
     */
    files: ["src/ui/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/shell", "@/shell/*", "@/cards", "@/cards/*", "@/agent-ui", "@/agent-ui/*", "@/app", "@/app/*"],
              message:
                "ui/ and lib/ are leaves. A primitive that reaches back into the app is no longer reusable by it.",
            },
          ],
        },
      ],
    },
  },

  {
    // Agent-supplied strings are untrusted input. They are rendered as text,
    // never as markup — enforced rather than remembered.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "react/no-danger": "error",
    },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
