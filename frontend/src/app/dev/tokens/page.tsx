/**
 * /dev/tokens — the Step 1 review surface.
 *
 * Every token defined in globals.css is rendered here with its literal value so
 * it can be checked against Figma directly. This route is a development aid and
 * is not part of the product surface.
 */

import { ViewportReadout } from "./Viewport";

type Swatch = { token: string; value: string; note?: string };

const GROUPS: { title: string; swatches: Swatch[] }[] = [
  {
    title: "Brand",
    swatches: [
      { token: "brand", value: "#eb1700", note: "Primary red — a Figma variable" },
      { token: "brand-grad-from", value: "#eb8479", note: "Kevin gradient start" },
      { token: "brand-grad-to", value: "#de2814", note: "Kevin gradient end" },
      { token: "accent-blue", value: "#71a8ef", note: "New Chat border + gradient" },
    ],
  },
  {
    title: "Ink",
    swatches: [
      { token: "ink-900", value: "#000000", note: "Headings, agent names" },
      { token: "ink-800", value: "#202020", note: "Gray/gray-100 — Figma variable" },
      { token: "ink-600", value: "#4a5567", note: "Breadcrumb, Role Selected" },
      { token: "ink-500", value: "#677489", note: "Subtitle, helper text" },
      { token: "ink-400", value: "#98a4b6", note: "Section labels, search" },
      { token: "ink-300", value: "#a3aebf", note: "Disclaimer footer" },
      { token: "ink-250", value: "#adb4c1", note: "Persona subtitle" },
      { token: "ink-200", value: "#b5c3d7", note: "Composer placeholder" },
    ],
  },
  {
    title: "Surfaces",
    swatches: [
      { token: "surface", value: "#ffffff", note: "Cards, nav, headers" },
      { token: "surface-muted", value: "#f1f4f8", note: "More pill" },
      { token: "surface-tint", value: "#f5f9ff", note: "Role pill" },
      { token: "canvas-from", value: "#fffbfb", note: "Canvas gradient bottom" },
      { token: "canvas-to", value: "#f5f9ff", note: "Canvas gradient top" },
    ],
  },
  {
    title: "Lines",
    swatches: [
      { token: "line", value: "#e3e8ef", note: "Default 1px border" },
      { token: "line-soft", value: "#e2e8f0", note: "Sidebar-02 divider (0.5px)" },
      { token: "line-faint", value: "#f3f3f3", note: "Nav header underline" },
      { token: "line-ghost", value: "#f8f8f8", note: "Persona card hairline" },
    ],
  },
  {
    title: "Agent chips",
    swatches: [
      { token: "chip-blue", value: "#d5e7fd", note: "SASA" },
      { token: "chip-amber", value: "#ffebb9", note: "Workshop Assist" },
      { token: "chip-green", value: "#d0f9db", note: "CR/CO Agent" },
    ],
  },
  {
    title: "State",
    swatches: [{ token: "disabled", value: "#d1d6dd", note: "Send button, inactive" }],
  },
];

const TYPE_STEPS = [
  { step: "text-64", size: "64px", lh: "1.2", tr: "—", face: "Display Bold", cls: "text-64 font-display font-bold" },
  { step: "text-24", size: "24px", lh: "24px", tr: "-0.336px", face: "Display Medium", cls: "text-24 font-display font-medium" },
  { step: "text-24", size: "24px", lh: "normal", tr: "—", face: "Text Regular", cls: "text-24 font-text leading-normal tracking-normal" },
  { step: "text-16", size: "16px", lh: "24px", tr: "-0.224px", face: "Text Medium", cls: "text-16 font-text font-medium" },
  { step: "text-16", size: "16px", lh: "24px", tr: "-0.224px", face: "Text Regular", cls: "text-16 font-text" },
  { step: "text-14", size: "14px", lh: "16px", tr: "-0.196px", face: "Display Medium", cls: "text-14 font-display font-medium" },
  { step: "text-14", size: "14px", lh: "16px", tr: "-0.196px", face: "Text Medium", cls: "text-14 font-text font-medium" },
  { step: "text-12", size: "12px", lh: "16px", tr: "-0.168px", face: "Text Regular", cls: "text-12 font-text" },
  { step: "text-10", size: "10px", lh: "normal", tr: "—", face: "Text Regular", cls: "text-10 font-text" },
];

const WEIGHTS = [
  {
    label: "Johnson Display",
    cls: "font-display",
    weights: [
      ["Light", "font-light"],
      ["Regular", "font-normal"],
      ["Medium", "font-medium"],
      ["Bold", "font-bold"],
    ],
  },
  {
    label: "Johnson Text",
    cls: "font-text",
    weights: [
      ["Regular", "font-normal"],
      ["Medium", "font-medium"],
      ["Bold", "font-bold"],
    ],
  },
] as const;

const RADII = [
  { token: "rounded-chip", value: "3.25px" },
  { token: "rounded-sm", value: "4px" },
  { token: "rounded-md", value: "8px" },
  { token: "rounded-lg", value: "12px" },
  { token: "rounded-xl", value: "16px" },
];

const RAILS: [string, string, string][] = [
  ["w-rail", "92px", "w-rail"],
  ["w-sidebar", "228px", "w-sidebar"],
  ["h-header", "88px", "w-full h-header"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="text-24 font-display font-medium text-ink-900 mb-1">{title}</h2>
      <div className="h-px w-full bg-line mb-6" />
      {children}
    </section>
  );
}

export default function TokensPage() {
  return (
    <main className="min-h-screen bg-linear-to-t from-canvas-from to-canvas-to px-10 py-12">
      <header className="mb-12">
        <h1 className="text-64 font-display font-bold text-ink-900">
          Design{" "}
          <span className="bg-linear-to-bl from-brand-grad-from to-brand-grad-to bg-clip-text text-transparent">
            tokens
          </span>
        </h1>
        <p className="text-24 font-text text-ink-500 leading-normal tracking-normal mt-4">
          Extracted from Figma frame 59525:9716. Check these against the design.
        </p>
      </header>

      <Section title="Viewport &amp; scale">
        <ViewportReadout />
      </Section>

      <Section title="Colour">
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-8">
            <p className="text-14 font-text font-medium text-ink-400 uppercase mb-3">{g.title}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {g.swatches.map((s) => (
                <div
                  key={s.token}
                  className="flex items-center gap-3 rounded-md border border-line bg-surface p-3 shadow-card"
                >
                  <div
                    className="size-12 shrink-0 rounded-sm border border-line-faint"
                    style={{ backgroundColor: s.value }}
                  />
                  <div className="min-w-0">
                    <p className="text-14 font-text font-medium text-ink-900">{s.token}</p>
                    <p className="text-12 font-text text-ink-500 tabular-nums">{s.value}</p>
                    {s.note ? <p className="text-10 font-text text-ink-400 mt-0.5">{s.note}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Type scale">
        <div className="rounded-lg border border-line bg-surface divide-y divide-line-faint">
          {TYPE_STEPS.map((t, i) => (
            <div key={i} className="flex items-baseline gap-6 p-4">
              <div className="w-52 shrink-0">
                <p className="text-12 font-text font-medium text-ink-900">{t.step}</p>
                <p className="text-10 font-text text-ink-400">
                  {t.face} · {t.size} / {t.lh} · {t.tr}
                </p>
              </div>
              <p className={`${t.cls} text-ink-900 truncate`}>Create Change Request</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Font faces">
        <div className="grid gap-4 md:grid-cols-2">
          {WEIGHTS.map((f) => (
            <div key={f.label} className="rounded-lg border border-line bg-surface p-5">
              <p className="text-12 font-text font-medium text-ink-400 uppercase mb-4">{f.label}</p>
              {f.weights.map(([name, wcls]) => (
                <div key={name} className="flex items-baseline gap-4 py-1.5">
                  <span className="w-20 shrink-0 text-10 font-text text-ink-400">{name}</span>
                  <span
                    className={`${f.cls} ${wcls} text-24 text-ink-900 leading-normal tracking-normal`}
                  >
                    Hello, Kevin
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radii, elevation & rails">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="text-12 font-text font-medium text-ink-400 uppercase mb-4">Radii</p>
            <div className="flex flex-wrap items-end gap-4">
              {RADII.map((r) => (
                <div key={r.token} className="text-center">
                  <div className={`size-14 border border-line bg-surface-tint ${r.token}`} />
                  <p className="text-10 font-text text-ink-500 mt-1.5">{r.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="text-12 font-text font-medium text-ink-400 uppercase mb-4">Elevation</p>
            <div className="flex gap-4">
              <div className="flex-1 rounded-md border border-line-ghost bg-surface p-4 shadow-card">
                <p className="text-10 font-text text-ink-500">shadow-card</p>
              </div>
              <div className="flex-1 rounded-md bg-brand p-4 shadow-inset-glow">
                <p className="text-10 font-text text-white">shadow-inset-glow</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="text-12 font-text font-medium text-ink-400 uppercase mb-4">Layout rails</p>
            <div className="space-y-2">
              {RAILS.map(([t, v, cls]) => (
                <div key={t} className="flex items-center gap-3">
                  <div className={`${cls} h-6 rounded-sm bg-chip-blue`} />
                  <span className="text-10 font-text text-ink-500 whitespace-nowrap">
                    {t} · {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}
