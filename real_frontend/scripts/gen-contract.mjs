/**
 * scripts/gen-contract.mjs
 *
 * Turns the backend's UI contract into TypeScript.
 *
 *   src/agent-ui/ui-contract.json  →  src/agent-ui/contract.generated.ts
 *                                     src/agent-ui/fixtures.generated.ts
 *
 * The JSON is a verbatim snapshot of `agui.ui_contract.contract_document()` —
 * the backend's own handover artifact. Refresh it with `npm run contract:pull`
 * and re-run this; a real prop change then shows up as a compile error in the
 * cards rather than as a blank panel in QA.
 *
 * Nothing here is hand-maintained. Do not edit the .generated.ts files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENT_UI = resolve(HERE, "..", "src", "agent-ui");
const SRC = resolve(AGENT_UI, "ui-contract.json");

/**
 * Sub-schemas the backend defines once and reuses across components. Keyed by
 * their sorted property signature so a rename on our side cannot silently
 * detach a name from the shape it describes.
 */
const KNOWN_SHAPES = new Map([
  ["label,tone,value,wide", "DetailRow"],
  ["badge,details,disabled,label,value", "OptionRow"],
  ["cost,processing_time,timestamp,tokens", "CardMeta"],
  [
    "allowed_values,editable,empty,field_type,key,label,lock_reason,lock_type,section,value",
    "FieldRow",
  ],
  ["fields,name", "DraftSection"],
  ["description,enabled,label,value", "CrMode"],
  [
    "description_of_change,iris_id,jira_id,platform,reason_for_change,target_system",
    "CrIntakeValues",
  ],
]);

const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const signature = (schema) => Object.keys(schema.properties ?? {}).sort().join(",");

/** Collected named interfaces, emitted ahead of the component props. */
const shared = new Map(); // name -> body lines

function jsonTypes(schema) {
  const t = schema.type;
  return Array.isArray(t) ? t : t == null ? [] : [t];
}

/** Render a JSON Schema node as a TypeScript type expression. */
function typeOf(schema, hint) {
  const types = jsonTypes(schema);
  const nullable = types.includes("null");
  const parts = [];

  // An enum is the tightest description available — prefer it over the raw type.
  if (Array.isArray(schema.enum)) {
    const lits = schema.enum
      .filter((v) => v !== null)
      .map((v) => (typeof v === "string" ? `"${v}"` : String(v)));
    if (lits.length) parts.push(lits.join(" | "));
  } else {
    if (types.includes("string")) parts.push("string");
    if (types.includes("integer") || types.includes("number")) parts.push("number");
    if (types.includes("boolean")) parts.push("boolean");
    if (types.includes("array")) parts.push(`${typeOf(schema.items ?? {}, hint)}[]`);
    if (types.includes("object")) parts.push(objectType(schema, hint));
  }

  if (!parts.length) parts.push("unknown");
  if (nullable) parts.push("null");
  return parts.join(" | ");
}

function objectType(schema, hint) {
  // Open map, e.g. crIntakeForm.errors — keyed by field name.
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    return `Record<string, ${typeOf(schema.additionalProperties, hint)}>`;
  }
  if (!schema.properties) return "Record<string, unknown>";

  const name = KNOWN_SHAPES.get(signature(schema));
  const body = objectBody(schema, hint);
  if (!name) return body;

  const existing = shared.get(name);
  if (existing && existing !== body) {
    throw new Error(
      `Shape "${name}" has two different definitions in the contract — the ` +
        `signature map in gen-contract.mjs is stale.`,
    );
  }
  shared.set(name, body);
  return name;
}

function objectBody(schema, hint) {
  const required = new Set(schema.required ?? []);
  const lines = ["{"];
  for (const [key, prop] of Object.entries(schema.properties)) {
    const doc = docComment(prop, "    ");
    if (doc) lines.push(doc);
    const optional = required.has(key) ? "" : "?";
    lines.push(`    ${key}${optional}: ${typeOf(prop, hint)};`);
  }
  lines.push("  }");
  return lines.join("\n");
}

function docComment(prop, indent) {
  const bits = [];
  if (prop.description) bits.push(prop.description);
  if (prop.default !== undefined) bits.push(`Default: ${JSON.stringify(prop.default)}.`);
  if (!bits.length) return null;
  const text = bits.join(" ");
  return `${indent}/** ${text.replace(/\*\//g, "*\\/")} */`;
}

// ── Build ────────────────────────────────────────────────────────────────────
const contract = JSON.parse(readFileSync(SRC, "utf8"));
const names = Object.keys(contract.components);

// Props bodies first — this populates `shared` as a side effect.
const propsBlocks = names.map((name) => {
  const schema = contract.components[name].props_schema;
  const iface = `${pascal(name)}Props`;
  const required = new Set(schema.required ?? []);
  const lines = [`export interface ${iface} {`];
  for (const [key, prop] of Object.entries(schema.properties)) {
    const doc = docComment(prop, "  ");
    if (doc) lines.push(doc);
    lines.push(`  ${key}${required.has(key) ? "" : "?"}: ${typeOf(prop, name)};`);
  }
  lines.push("}");
  return { name, iface, text: lines.join("\n") };
});

/** Hoisted bodies were rendered as nested members; pull them back to column 0. */
const dedent = (body) =>
  body
    .split("\n")
    .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
    .join("\n");

const sharedBlocks = [...shared.entries()].map(
  ([name, body]) => `export interface ${name} ${dedent(body)}`,
);

const header = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by scripts/gen-contract.mjs from src/agent-ui/ui-contract.json,
 * which is a verbatim snapshot of the backend's agui.ui_contract contract.
 *
 * Regenerate with: npm run contract:gen
 */
`;

const out = [
  header,
  `export const CONTRACT_VERSION = ${contract.contract_version} as const;\n`,
  `/** Every component the agent may name. A name outside this list is a contract violation. */`,
  `export const COMPONENT_NAMES = [\n${names.map((n) => `  "${n}",`).join("\n")}\n] as const;\n`,
  `export type ComponentName = (typeof COMPONENT_NAMES)[number];\n`,
  `// ── Shared shapes ───────────────────────────────────────────────────────────\n`,
  sharedBlocks.join("\n\n"),
  `\n// ── Component props ─────────────────────────────────────────────────────────\n`,
  propsBlocks.map((b) => b.text).join("\n\n"),
  `
// ── The discriminated union the host switches on ────────────────────────────

/**
 * A component the agent has selected. \`name\` is the discriminant, so narrowing
 * on it gives the card its exact props with no cast.
 */
export type AgentComponent =
${propsBlocks.map((b) => `  | { name: "${b.name}"; props: ${b.iface} }`).join("\n")};

/** Maps a component name to its props type, for the registry's signature. */
export interface PropsByName {
${propsBlocks.map((b) => `  ${b.name}: ${b.iface};`).join("\n")}
}
`,
].join("\n");

writeFileSync(resolve(AGENT_UI, "contract.generated.ts"), out, "utf8");

// ── Fixtures ─────────────────────────────────────────────────────────────────
const fixtures = [
  header.replace("contract.generated.ts", "fixtures.generated.ts"),
  `import type { PropsByName } from "./contract.generated";\n`,
  `/**`,
  ` * The backend's own example payload per component. These are what the cards are`,
  ` * built and reviewed against — no running agent required.`,
  ` */`,
  `export const FIXTURES: { [K in keyof PropsByName]: PropsByName[K] } = ${JSON.stringify(
    // `example` in the contract document is the props object itself, not a
    // full { version, name, props } envelope.
    Object.fromEntries(names.map((n) => [n, contract.components[n].example])),
    null,
    2,
  )};\n`,
].join("\n");

writeFileSync(resolve(AGENT_UI, "fixtures.generated.ts"), fixtures, "utf8");

console.log(
  `contract v${contract.contract_version}: ${names.length} components, ` +
    `${shared.size} shared shapes → contract.generated.ts, fixtures.generated.ts`,
);
