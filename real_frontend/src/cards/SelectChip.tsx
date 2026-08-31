/**
 * cards/SelectChip.tsx — Figma component set "Platform Selection" (59463:12746).
 *
 * A compact, label-only chip. All three variants are from the design:
 *
 *   Default   bg `option-bg`, border `line-soft`, label `ink-900`
 *   Hover     same, plus a drop shadow, label turns `brand`
 *   Clicked   bg `brand-a08`, border `brand-a24`, label `brand`
 *
 * Note there is **no radio** here — unlike the reference-CR rows, which need one
 * because they carry a separate disclosure control. These chips are the whole
 * hit target, so selection is expressed by fill and label colour alone.
 *
 * Type is 14px / 20px with **+0.005em** tracking — the one place the design
 * departs from its usual −0.014em.
 */
"use client";

import { cn } from "@/lib/cn";

export function SelectChip({
  label,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-center justify-center rounded-sm border p-2 text-14 leading-5 tracking-chip font-text whitespace-nowrap transition-colors",
        selected
          ? "border-brand-a24 bg-brand-a08 text-brand"
          : "border-line-soft bg-option-bg text-ink-900",
        !disabled && !selected && "hover:text-brand hover:drop-shadow-chip",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {label}
    </button>
  );
}
