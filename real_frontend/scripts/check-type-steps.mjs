/**
 * Guards a pairing that has no other way to fail loudly.
 *
 * `lib/cn.ts` declares TYPE_STEPS so that tailwind-merge files `text-16` under
 * font-size rather than colour. A step added to `globals.css` but not to that
 * list does not error, does not warn, and works — until the first time a size
 * and a colour are merged in one `cn()` call, at which point the size is
 * silently dropped. `text-16` is the worst case: the result is
 * indistinguishable from correct, because 16px is the inherited default.
 *
 * A type error cannot catch this — both sides are strings in different files.
 * So the build checks it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const css = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
const cn = readFileSync(resolve(root, "src/lib/cn.ts"), "utf8");

// `--text-24: 1.5rem;` — the step declarations, not the --text-24--line-height
// modifiers that follow them.
const cssSteps = [...css.matchAll(/^\s*--text-(\d+):\s/gm)].map((m) => m[1]);

const declared = cn.match(/TYPE_STEPS\s*=\s*\[([^\]]*)\]/s);
if (!declared) {
  console.error("check-type-steps: could not find TYPE_STEPS in src/lib/cn.ts");
  process.exit(1);
}
const cnSteps = [...declared[1].matchAll(/"(\d+)"/g)].map((m) => m[1]);

const missing = cssSteps.filter((s) => !cnSteps.includes(s));
const extra = cnSteps.filter((s) => !cssSteps.includes(s));

if (missing.length > 0 || extra.length > 0) {
  console.error("check-type-steps: globals.css and cn.ts disagree.\n");
  if (missing.length > 0) {
    console.error(
      `  In globals.css but not TYPE_STEPS: ${missing.map((s) => `text-${s}`).join(", ")}`,
    );
    console.error("  → these will be dropped when merged with a text colour.\n");
  }
  if (extra.length > 0) {
    console.error(
      `  In TYPE_STEPS but not globals.css: ${extra.map((s) => `text-${s}`).join(", ")}`,
    );
    console.error("  → a step was removed from the design system.\n");
  }
  process.exit(1);
}

console.log(`check-type-steps: ${cssSteps.length} type steps paired (${cssSteps.join(", ")})`);
