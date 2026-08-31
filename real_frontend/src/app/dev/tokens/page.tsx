import { notFound } from "next/navigation";

/**
 * /dev/tokens — the design system, rendered.
 *
 * A token file is a list of hex values nobody can review. Rendered, "is this
 * the right red?" and "did the 3.25px radius survive the port?" become
 * questions someone can answer by looking.
 *
 * **Returns 404 in production.** The guard is a server-side check in a Server
 * Component, so the page is not merely hidden — its markup is never produced,
 * and the route ships as a not-found. Dev surfaces that are only unlinked have
 * a way of being found.
 */
const COLORS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Brand", ["brand", "brand-grad-from", "brand-grad-to", "accent-blue"]],
  ["Brand alpha", ["brand-a08", "brand-a12", "brand-a24", "brand-a52"]],
  ["Ink", ["ink-900", "ink-800", "ink-600", "ink-500", "ink-450", "ink-400", "ink-300", "ink-250", "ink-200", "ink-muted", "ink-label"]],
  ["Surfaces", ["surface", "surface-muted", "surface-tint", "canvas-from", "canvas-to", "option-bg"]],
  ["Lines", ["line", "line-soft", "line-faint", "line-ghost", "table-line"]],
  ["Chips", ["chip-blue", "chip-amber", "chip-green"]],
  ["State", ["disabled", "field-disabled", "error", "warning", "success"]],
  ["Buttons", ["btn-from", "btn-to", "danger-soft-bg", "danger-soft-line", "danger-soft-text"]],
  ["Modal", ["scrim", "modal-close", "table-head"]],
  ["Badge / avatar", ["badge-blue", "badge-blue-line", "avatar-from", "avatar-to"]],
];

const TYPE = ["10", "12", "14", "16", "20", "24", "64"] as const;

const RADII = ["chip", "sm", "md", "lg", "xl", "2xl"] as const;

export default function TokensPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-5xl px-8 py-12">
      <h1 className="font-display text-24 font-medium text-ink-900">Design tokens</h1>
      <p className="mt-2 text-14 text-ink-500">
        Extracted from Figma file OKMf8QB5HkTjgaT3lDR438. Every value is a literal
        read from a frame — never an interpretation.
      </p>

      <Section title="Colour">
        {COLORS.map(([group, names]) => (
          <div key={group} className="mb-6">
            <h3 className="mb-2 text-12 text-ink-400 uppercase">{group}</h3>
            <div className="flex flex-wrap gap-3">
              {names.map((name) => (
                <div key={name} className="w-36">
                  <div
                    className="h-12 w-full rounded-md border border-line"
                    style={{ background: `var(--color-${name})` }}
                  />
                  <div className="mt-1 text-10 text-ink-500">{name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Type steps">
        <p className="mb-4 text-12 text-ink-500">
          Named by their Figma pixel size, expressed in rem. Tracking is a uniform
          −1.4% — not a simplification: −0.336/24, −0.224/16 and −0.196/14 all
          equal exactly −0.014em.
        </p>
        {TYPE.map((step) => (
          <div key={step} className="flex items-baseline gap-4 border-b border-line-faint py-2">
            <code className="w-20 shrink-0 text-12 text-ink-400">text-{step}</code>
            <span className={`text-${step} text-ink-900`}>Change Request</span>
          </div>
        ))}
      </Section>

      <Section title="Font families">
        <p className="font-display text-20 text-ink-900">
          Johnson Display — headings and the modal title
        </p>
        <p className="font-text text-16 text-ink-800">
          Johnson Text — body copy, field values, agent prose
        </p>
        <p className="mt-2 text-12 text-ink-500">
          The supplied set has no Johnson Text Light. If a frame calls for it,
          raise it rather than substituting a nearby weight.
        </p>
      </Section>

      <Section title="Radii">
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r} className="text-center">
              <div
                className="h-16 w-16 border border-line bg-surface-tint"
                style={{ borderRadius: `var(--radius-${r})` }}
              />
              <div className="mt-1 text-10 text-ink-500">{r}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-12 text-ink-500">
          <code>chip</code> is 3.25px. Yes, really — it is what the frame says.
        </p>
      </Section>

      <Section title="Elevation">
        <div className="flex flex-wrap gap-6">
          {["card", "inset-glow", "avatar", "avatar-inset"].map((s) => (
            <div key={s} className="text-center">
              <div
                className="h-20 w-32 rounded-lg bg-surface"
                style={{ boxShadow: `var(--shadow-${s})` }}
              />
              <div className="mt-2 text-10 text-ink-500">shadow-{s}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Primary action">
        <button type="button" className="bg-btn-primary rounded-md px-6 py-3 text-14 text-white">
          Submit for Approval
        </button>
        <p className="mt-3 text-12 text-ink-500">
          A gradient at 225.99°, not flat brand red — authored that way in frame
          59616:13508.
        </p>
      </Section>

      <Section title="Layout rails">
        <div className="flex items-end gap-4">
          {[
            ["rail", "92px"],
            ["sidebar", "228px"],
            ["header", "88px"],
          ].map(([name, px]) => (
            <div key={name}>
              <div
                className="h-10 bg-surface-muted"
                style={{ width: `var(--spacing-${name})` }}
              />
              <div className="mt-1 text-10 text-ink-500">
                {name} · {px}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 font-display text-20 font-medium text-ink-900">{title}</h2>
      {children}
    </section>
  );
}
