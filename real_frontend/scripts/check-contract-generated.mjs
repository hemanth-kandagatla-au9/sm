/**
 * Asserts that the generated contract files match the contract they came from.
 *
 * `contract.generated.ts` and `fixtures.generated.ts` are build output that
 * lives in the repo — committed so cards compile and test with no backend
 * running. Committed generated files have one classic failure: someone edits
 * them by hand, or refreshes `ui-contract.json` and forgets to regenerate. Both
 * produce a tree where the types no longer describe the contract, and nothing
 * complains until a card renders the wrong shape.
 *
 * So the build regenerates into memory and compares. Byte-identical or fail.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentUi = join(root, "src", "agent-ui");
const GENERATED = ["contract.generated.ts", "fixtures.generated.ts"];

const committed = Object.fromEntries(
  GENERATED.map((f) => [f, readFileSync(join(agentUi, f), "utf8")]),
);

// Regenerate in place, compare, then restore whatever was there. The generator
// only knows how to write into src/agent-ui, so this is done as write-and-restore
// rather than by pointing it at a temporary directory.
const backup = mkdtempSync(join(tmpdir(), "contract-check-"));
for (const f of GENERATED) cpSync(join(agentUi, f), join(backup, f));

let failures = [];
try {
  execFileSync(process.execPath, [join(root, "scripts", "gen-contract.mjs")], {
    stdio: "pipe",
  });

  for (const f of GENERATED) {
    const fresh = readFileSync(join(agentUi, f), "utf8");
    if (fresh !== committed[f]) failures.push(f);
  }
} finally {
  for (const f of GENERATED) writeFileSync(join(agentUi, f), committed[f]);
  rmSync(backup, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("check-contract: generated files are stale or hand-edited.\n");
  for (const f of failures) console.error(`  ${f} does not match ui-contract.json`);
  console.error("\n  → run: npm run contract:gen");
  console.error("  → never edit a .generated.ts file by hand.\n");
  process.exit(1);
}

console.log(`check-contract: ${GENERATED.length} generated files match ui-contract.json`);
