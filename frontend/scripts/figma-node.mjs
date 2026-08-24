/**
 * scripts/figma-node.mjs
 *
 * Pulls a Figma node's real styling from the REST API and prints it in this
 * project's token vocabulary.
 *
 *   npm run figma -- 59646:14750
 *   npm run figma -- 59646:14750 --depth 4
 *   npm run figma -- 59525:10206 --png            # render to _ref/figma/shots/
 *
 * Why this exists: the Figma MCP server has a per-plan call quota that we
 * exhausted. The REST API is a separate quota, free on every plan, and returns
 * more raw detail than the MCP's pre-converted output — fills, strokes, effects,
 * typography and auto-layout exactly as authored.
 *
 * The useful part is the annotation: every colour is checked against the tokens
 * already defined in src/app/globals.css, so output says either `line` (reuse it)
 * or `NEW` (add it to the token file first, per DECISIONS.md D4).
 *
 * Auth: put `FIGMA_TOKEN=figd_...` in .env.local (gitignored). Generate one at
 * Figma → Settings → Security → Personal access tokens, scope `file_content:read`.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
/**
 * Which Figma file to read. Overridable because the design was duplicated into a
 * second account partway through — the node ids are identical across the copy,
 * so only the key changes.
 *
 *   FIGMA_FILE_KEY=... in .env.local, or --file <key>
 */
const DEFAULT_FILE_KEY = "OKMf8QB5HkTjgaT3lDR438";
const SHOTS = resolve(ROOT, "..", "_ref", "figma", "shots");

// ── Auth ─────────────────────────────────────────────────────────────────────
/** Reads a key from the environment, falling back to .env.local. */
function readEnv(name) {
  if (process.env[name]) return process.env[name];
  const envPath = resolve(ROOT, ".env.local");
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith(`${name}=`));
    if (line) return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function readToken() {
  const token = readEnv("FIGMA_TOKEN");
  if (token) return token;
  console.error(
    "No FIGMA_TOKEN found.\n" +
      "  1. Figma → Settings → Security → Personal access tokens → Generate\n" +
      "     (scope: file_content:read)\n" +
      "  2. Add it to frontend/.env.local as:  FIGMA_TOKEN=figd_...\n" +
      "  .env.local is gitignored — do not commit or paste the token anywhere else.",
  );
  process.exit(1);
}

// ── Token map, built from the real token file ────────────────────────────────
/** hex → token name, so output can say "reuse `line`" instead of "#e3e8ef". */
function loadTokens() {
  const css = readFileSync(resolve(ROOT, "src", "app", "globals.css"), "utf8");
  const map = new Map();
  for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g)) {
    map.set(normaliseColour(m[2]), m[1]);
  }
  return map;
}

function normaliseColour(v) {
  const s = v.trim().toLowerCase();
  const rgba = s.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return s;
  const [r, g, b, a = "1"] = rgba[1].split(",").map((x) => x.trim());
  return `rgba(${+r}, ${+g}, ${+b}, ${parseFloat(a)})`;
}

function figmaColour({ r, g, b, a = 1 }, opacity = 1) {
  const alpha = Math.round(a * opacity * 1000) / 1000;
  const to255 = (c) => Math.round(c * 255);
  if (alpha >= 1) {
    return `#${[r, g, b].map((c) => to255(c).toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha})`;
}

/** Annotate a colour with its token name, or mark it as new. */
function annotate(hex, tokens) {
  const key = normaliseColour(hex);
  const name = tokens.get(key);
  return name ? `${hex}  → ${name}` : `${hex}  → NEW (add to globals.css)`;
}

/** Design px → rem at the 1512 reference width, matching D17. */
const rem = (px) => `${Math.round((px / 16) * 10000) / 10000}rem`;

// ── Rendering ────────────────────────────────────────────────────────────────
function describe(node, tokens, depth, maxDepth, indent = "") {
  const out = [];
  const b = node.absoluteBoundingBox;
  const size = b ? `${Math.round(b.width)}×${Math.round(b.height)}` : "";

  // Figma instances routinely carry layers toggled off. They are still in the
  // API response, and rendering one would put something on screen that the
  // design deliberately hides — so say so loudly and do not descend.
  if (node.visible === false) {
    return `${indent}${node.type} ${node.id}  ${size}  "${node.name}"  ← HIDDEN, do not render`;
  }

  out.push(`${indent}${node.type} ${node.id}  ${size}  "${node.name}"`);

  const pad = indent + "    ";
  const add = (label, value) => value && out.push(`${pad}${label}: ${value}`);

  if (node.characters) add("text", JSON.stringify(node.characters));

  if (node.style) {
    const s = node.style;
    add(
      "font",
      `${s.fontFamily} ${s.fontWeight} ${s.fontSize}px (${rem(s.fontSize)})` +
        (s.lineHeightPx ? ` / lh ${Math.round(s.lineHeightPx * 100) / 100}px` : "") +
        (s.letterSpacing
          ? ` / tracking ${Math.round((s.letterSpacing / s.fontSize) * 10000) / 10000}em`
          : ""),
    );
  }

  for (const f of node.fills ?? []) {
    if (f.visible === false) continue;
    if (f.type === "SOLID") add("fill", annotate(figmaColour(f.color, f.opacity ?? 1), tokens));
    else if (f.type?.startsWith("GRADIENT")) {
      const stops = (f.gradientStops ?? [])
        .map((s) => `${figmaColour(s.color)} ${Math.round(s.position * 100)}%`)
        .join(", ");
      add("fill", `${f.type} — ${stops}`);
    }
  }

  for (const s of node.strokes ?? []) {
    if (s.visible === false) continue;
    if (s.type === "SOLID") {
      add(
        "stroke",
        `${annotate(figmaColour(s.color, s.opacity ?? 1), tokens)}  ${node.strokeWeight ?? 1}px`,
      );
    }
  }

  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    add("radius", `tl ${tl} · tr ${tr} · br ${br} · bl ${bl}`);
  } else if (node.cornerRadius) {
    add("radius", `${node.cornerRadius}px (${rem(node.cornerRadius)})`);
  }

  if (node.layoutMode && node.layoutMode !== "NONE") {
    const p = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
    add(
      "layout",
      `${node.layoutMode.toLowerCase()} · gap ${node.itemSpacing ?? 0} · padding ${p.map((x) => x ?? 0).join(" ")}` +
        ` · main ${node.primaryAxisAlignItems ?? "MIN"} · cross ${node.counterAxisAlignItems ?? "MIN"}`,
    );
  }

  for (const e of node.effects ?? []) {
    if (e.visible === false) continue;
    add(
      "effect",
      `${e.type} ${e.offset ? `${e.offset.x} ${e.offset.y}` : ""} blur ${e.radius}` +
        `${e.spread ? ` spread ${e.spread}` : ""} ${e.color ? figmaColour(e.color) : ""}`,
    );
  }

  if (node.opacity != null && node.opacity !== 1) add("opacity", String(node.opacity));

  if (depth < maxDepth) {
    for (const child of node.children ?? []) {
      out.push(describe(child, tokens, depth + 1, maxDepth, indent + "  "));
    }
  } else if (node.children?.length) {
    out.push(`${pad}… ${node.children.length} children (raise --depth to see them)`);
  }

  return out.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ids = args.filter((a) => /^\d+[:-]\d+$/.test(a)).map((a) => a.replace("-", ":"));
const wantPng = args.includes("--png");
const wantSvg = args.includes("--svg");
/** With --svg, write into public/shell/ under these names, in id order. */
const nameArg = args.indexOf("--as");
const outNames = nameArg > -1 ? args[nameArg + 1].split(",") : null;
const depthArg = args.indexOf("--depth");
const maxDepth = depthArg > -1 ? Number(args[depthArg + 1]) : 3;

if (!ids.length) {
  console.error("Usage: npm run figma -- <node-id> [<node-id>…] [--depth N] [--png]");
  process.exit(1);
}

const token = readToken();
const headers = { "X-Figma-Token": token };

const fileArg = args.indexOf("--file");
const FILE_KEY =
  (fileArg > -1 ? args[fileArg + 1] : null) ?? readEnv("FIGMA_FILE_KEY") ?? DEFAULT_FILE_KEY;
console.error(`file: ${FILE_KEY}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Never sleep longer than this on a 429; beyond it, report and stop. */
const MAX_WAIT_S = 120;

/**
 * Node responses are cached to disk, keyed by the request path.
 *
 * The `/v1/files/:key/nodes` endpoint is quota-expensive and this file has ~14k
 * nodes, so re-fetching a node just to look at it again is how a day's quota
 * disappears. Everything pulled stays readable offline, which also means the
 * design values behind any decision can be re-checked later without a network
 * call at all.
 *
 * Pass --fresh to bypass.
 */
const CACHE_DIR = resolve(ROOT, "..", "_ref", "figma", "cache");

function cachePath(path) {
  const safe = path.replace(/[^\w.-]+/g, "_").slice(0, 120);
  return resolve(CACHE_DIR, `${safe}.json`);
}

/**
 * Figma's REST rate limit is cost-based, and `/v1/files/.../nodes` is one of the
 * expensive endpoints — a couple of deep pulls in quick succession will trip it.
 * It clears in well under a minute, so a 429 is a wait, not a failure. Retrying
 * here means a rate limit never costs a re-run or loses the earlier output.
 */
/**
 * Find a node inside any cached response.
 *
 * `--depth` only limits *printing*; a cached response holds the node's entire
 * subtree. So a node already pulled as part of a parent needs no request at all.
 * Given how expensive `/v1/files/.../nodes` is on a file this size, searching
 * the cache first is the difference between finishing offline and waiting days
 * for a quota window.
 */
function findInCache(nodeId) {
  if (!existsSync(CACHE_DIR)) return null;

  const hunt = (node) => {
    if (!node || typeof node !== "object") return null;
    if (node.id === nodeId) return node;
    for (const child of node.children ?? []) {
      const hit = hunt(child);
      if (hit) return hit;
    }
    return null;
  };

  for (const file of readdirSync(CACHE_DIR)) {
    if (!file.startsWith("_v1_files")) continue;
    let doc;
    try {
      doc = JSON.parse(readFileSync(resolve(CACHE_DIR, file), "utf8"));
    } catch {
      continue;
    }
    for (const entry of Object.values(doc.nodes ?? {})) {
      const hit = hunt(entry.document);
      if (hit) return { node: hit, file };
    }
  }
  return null;
}

async function api(path, attempt = 0) {
  const cached = cachePath(path);
  if (!args.includes("--fresh") && existsSync(cached)) {
    console.error(`(cached) ${path}`);
    return JSON.parse(readFileSync(cached, "utf8"));
  }

  const res = await fetch(`https://api.figma.com${path}`, { headers });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const tier = res.headers.get("x-figma-rate-limit-type") ?? "unknown";

    // Figma returns Retry-After in seconds, and on the free tier that can be
    // *days* — this is a quota window, not a burst limit. Only ever wait out a
    // short one; anything longer has to be reported, not slept through.
    if (Number.isFinite(retryAfter) && retryAfter > MAX_WAIT_S) {
      const resetsAt = new Date(Date.now() + retryAfter * 1000);
      throw new Error(
        `quota exhausted (tier "${tier}"). Resets in ${(retryAfter / 86400).toFixed(1)} days, ` +
          `at ${resetsAt.toISOString()}.\n` +
          `Nothing was fetched. Cached nodes in ${CACHE_DIR} are still readable.`,
      );
    }

    if (attempt < 5) {
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(2 ** attempt * 5000, MAX_WAIT_S * 1000);
      console.error(`rate limited — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/5)`);
      await sleep(waitMs);
      return api(path, attempt + 1);
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cached, JSON.stringify(json), "utf8");
  return json;
}

try {
  if (wantPng || wantSvg) {
    const format = wantSvg ? "svg" : "png";
    const scale = wantSvg ? "" : "&scale=2";
    const data = await api(`/v1/images/${FILE_KEY}?ids=${ids.join(",")}&format=${format}${scale}`);
    const dir = wantSvg ? resolve(ROOT, "public", "shell") : SHOTS;
    mkdirSync(dir, { recursive: true });
    for (const [i, id] of ids.entries()) {
      const url = data.images[id];
      if (!url) {
        console.error(`${id}: no render returned`);
        continue;
      }
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const base = outNames?.[i] ?? id.replace(":", "-");
      const file = resolve(dir, `${base}.${format}`);
      writeFileSync(file, buf);
      console.log(`${id} → ${file} (${(buf.length / 1024).toFixed(1)} KB)`);
    }
  } else {
    const tokens = loadTokens();

    // Anything already sitting inside a cached subtree costs nothing.
    const missing = [];
    const resolved = new Map();
    for (const id of ids) {
      const hit = args.includes("--fresh") ? null : findInCache(id);
      if (hit) {
        console.error(`(cached subtree) ${id} — from ${hit.file}`);
        resolved.set(id, hit.node);
      } else {
        missing.push(id);
      }
    }

    if (missing.length) {
      const data = await api(`/v1/files/${FILE_KEY}/nodes?ids=${missing.join(",")}`);
      for (const id of missing) {
        const doc = data.nodes[id]?.document;
        if (doc) resolved.set(id, doc);
        else console.error(`${id}: not found in this file`);
      }
    }

    for (const id of ids) {
      const doc = resolved.get(id);
      if (!doc) continue;
      console.log(describe(doc, tokens, 0, maxDepth));
      console.log("");
    }
  }
} catch (err) {
  console.error(`Figma REST API: ${err.message}`);
  process.exit(1);
}
