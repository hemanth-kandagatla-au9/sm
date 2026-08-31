/**
 * scripts/pull-contract.mjs
 *
 * Refreshes src/agent-ui/ui-contract.json from a running backend.
 *
 *   npm run contract:pull                    # http://localhost:8084
 *   AGUI_API_BASE=http://host:8084 npm run contract:pull
 *
 * This is the only thing in this project that talks to the backend, and it is
 * deliberately a manual step: the snapshot is committed so that cards can be
 * built and reviewed with nothing running. Run this when the backend team says
 * the contract moved, then `npm run contract:gen` and fix whatever stops
 * compiling.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEST = resolve(HERE, "..", "src", "agent-ui", "ui-contract.json");
const BASE = process.env.AGUI_API_BASE ?? "http://localhost:8084";
const URL_ = `${BASE.replace(/\/$/, "")}/api/ui-contract`;

let incoming;
try {
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  incoming = await res.json();
} catch (err) {
  console.error(
    `Could not reach ${URL_} — ${err.message}\n` +
      `Start the backend's agui_server.py, or set AGUI_API_BASE to where it is running.\n` +
      `The committed snapshot has been left untouched.`,
  );
  process.exit(1);
}

if (typeof incoming?.contract_version !== "number" || !incoming?.components) {
  console.error(`${URL_} did not return a contract document. Nothing written.`);
  process.exit(1);
}

const previous = JSON.parse(readFileSync(DEST, "utf8"));
const next = JSON.stringify(incoming, null, 2);

if (JSON.stringify(previous, null, 2) === next) {
  console.log(`contract unchanged (v${incoming.contract_version}).`);
  process.exit(0);
}

writeFileSync(DEST, next + "\n", "utf8");

const before = Object.keys(previous.components ?? {});
const after = Object.keys(incoming.components);
const added = after.filter((n) => !before.includes(n));
const removed = before.filter((n) => !after.includes(n));

console.log(`contract updated: v${previous.contract_version} → v${incoming.contract_version}`);
if (added.length) console.log(`  added:   ${added.join(", ")}`);
if (removed.length) console.log(`  removed: ${removed.join(", ")}`);
console.log(`Now run: npm run contract:gen`);
