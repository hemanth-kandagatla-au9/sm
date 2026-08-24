/**
 * cards/Radio.tsx — Figma component set "Radio Button" (57719:9310).
 *
 * All three variants come from the design, pulled via the REST API (D21):
 *
 *   default   stroke #4a5567 (ink-600) 1.5
 *   Hover     fill rgba(235,23,0,0.12), stroke rgba(235,23,0,0.52) 1.5
 *   Clicked   stroke #eb1700 (brand) 1.5, plus an 8×8 filled centre in brand
 *
 * Geometry is authored in a 24-unit box: the ring spans 20 of 24 and the centre
 * dot 8 of 24. At the design's 16px render that is a 13.33px ring with a 1px
 * stroke and a 5.33px dot.
 *
 * Drawn in CSS rather than from the exported asset — a deliberate, scoped
 * exception to D14. Figma exports these as vectors with baked-in stroke colours,
 * so using assets would mean three separate files that cannot inherit a token,
 * and the hover transition would have to swap images mid-interaction.
 */
import { cn } from "@/lib/cn";

export function Radio({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span aria-hidden className="grid size-4 shrink-0 place-items-center">
      {/*
       * Hover is driven by `group/option` on the enclosing row, not by the
       * control itself — the whole option is the hit target, and a ring that
       * only lights up under the 13px circle would feel broken.
       */}
      <span
        className={cn(
          "grid size-[0.8333rem] place-items-center rounded-full border transition-colors",
          checked
            ? "border-brand"
            : disabled
              ? "border-ink-600"
              : "border-ink-600 group-hover/option:border-brand-a52 group-hover/option:bg-brand-a12",
        )}
      >
        {checked ? <span className="size-[0.3333rem] rounded-full bg-brand" /> : null}
      </span>
    </span>
  );
}
