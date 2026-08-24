/**
 * scripts/export-prod.mjs
 *
 * Regenerates ../frontend-prod — the deployable, handover copy of this app.
 *
 *   npm run export:prod
 *
 * ── Why generated, not hand-maintained ──────────────────────────────────────
 * Two copies edited by hand drift. A fix lands here, does not get ported, and
 * the other team debugs something that was solved days ago. So the production
 * tree is **output**, never a place to edit: run this after any change and it is
 * rebuilt from scratch.
 *
 * Anything edited directly in frontend-prod/ will be destroyed on the next run.
 * That is the point.
 *
 * ── What comes out ──────────────────────────────────────────────────────────
 * Everything that serves the product, and nothing that serves development:
 * no /dev routes, no scripted backend, no Figma tooling, no editor config, and
 * emphatically no .env.local — which holds a live API token.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");
const OUT = resolve(SRC, "..", "frontend-prod");

/**
 * Paths never copied, relative to the app root.
 *
 * `.env.local` is the one that matters most: it holds a Figma personal access
 * token. Everything else here is noise; that one would be a leak.
 */
const EXCLUDE = new Set(
  [
    "node_modules",
    ".next",
    ".git",
    ".env.local",
    ".claude",
    "tsconfig.tsbuildinfo",
    // Development surfaces
    "src/app/dev",
    "src/app/api/agent/mock",
    // Tooling that needs credentials or a designer's file
    "scripts/figma-node.mjs",
    "scripts/export-prod.mjs",
  ].map((p) => p.split("/").join(sep)),
);

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    const rel = relative(SRC, src);
    if (EXCLUDE.has(rel) || EXCLUDE.has(entry)) continue;
    if (statSync(src).isDirectory()) copyTree(src, join(to, entry));
    else cpSync(src, join(to, entry));
  }
}

/**
 * Kept between exports: reinstalling on every run is slow, and on Windows
 * removing an in-use `node_modules` fails outright with EBUSY.
 *
 * Everything else is wiped, so a file deleted upstream disappears here too.
 */
const PRESERVE = new Set(["node_modules", ".next"]);

if (existsSync(OUT)) {
  for (const entry of readdirSync(OUT)) {
    if (PRESERVE.has(entry)) continue;
    rmSync(join(OUT, entry), { recursive: true, force: true });
  }
} else {
  mkdirSync(OUT, { recursive: true });
}
copyTree(SRC, OUT);

// ── Point the app at the real backend ────────────────────────────────────────
const pagePath = join(OUT, "src", "app", "page.tsx");
let page = readFileSync(pagePath, "utf8");
page = page
  .replace(
    'process.env.NEXT_PUBLIC_AGENT_URL ?? "/api/agent/mock?scenario=flow"',
    'process.env.NEXT_PUBLIC_AGENT_URL ?? "/api/agent"',
  )
  .replace(
    " * Points at the scripted backend by default so the flow runs with nothing else\n * running. Set `NEXT_PUBLIC_AGENT_URL=/api/agent` to talk to `agui_server.py`.",
    " * Talks to the agent through /api/agent, which proxies to `agui_server.py`.\n * Point it elsewhere with NEXT_PUBLIC_AGENT_URL.",
  );
if (page.includes("mock")) {
  throw new Error("page.tsx still references the mock after rewriting — check export-prod.mjs");
}
writeFileSync(pagePath, page, "utf8");

// ── Trim dev-only npm scripts ────────────────────────────────────────────────
const pkgPath = join(OUT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = "cr-co-frontend";
delete pkg.scripts.figma;
delete pkg.scripts["export:prod"];
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

// ── Document the two environment variables that matter ───────────────────────
writeFileSync(
  join(OUT, ".env.example"),
  `# Where agui_server.py is reachable from the Next server.
# Used by the /api/agent proxy. Server-side only — never sent to the browser.
AGUI_BACKEND_URL=http://localhost:8084/copilotkit

# Where the browser sends agent traffic. Defaults to the same-origin proxy;
# override only to bypass it.
# NEXT_PUBLIC_AGENT_URL=/api/agent

# Base for the deterministic REST helpers (platforms, target systems, Jira).
# NEXT_PUBLIC_AGUI_API_BASE=http://localhost:8084
`,
  "utf8",
);

// ── The handover doc becomes the README ──────────────────────────────────────
// Maintained upstream at docs/HANDOVER.md so it is reviewed with the code.
const handover = join(SRC, "docs", "HANDOVER.md");
if (existsSync(handover)) {
  cpSync(handover, join(OUT, "README.md"));
  rmSync(join(OUT, "docs"), { recursive: true, force: true });
}

// ── Sanity checks ────────────────────────────────────────────────────────────
const problems = [];
if (existsSync(join(OUT, ".env.local"))) problems.push(".env.local was copied — it holds a token");
if (existsSync(join(OUT, "src", "app", "dev"))) problems.push("/dev routes were copied");
if (existsSync(join(OUT, "src", "app", "api", "agent", "mock"))) problems.push("mock backend was copied");
if (problems.length) {
  console.error("Export is unsafe:\n  " + problems.join("\n  "));
  process.exit(1);
}

const count = (dir) =>
  readdirSync(dir, { recursive: true }).filter((f) => !String(f).includes("node_modules")).length;

console.log(`frontend-prod rebuilt: ${count(OUT)} files`);
console.log(`  excluded: /dev routes, mock backend, Figma tooling, .env.local, .claude`);
console.log(`  next: cd ../frontend-prod && npm install && npm run build`);
