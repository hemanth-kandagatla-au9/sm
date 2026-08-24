/**
 * cards/Select.tsx — Figma "Project details" open state (59527:10623),
 * and its Target System / Template ID siblings (59602:11548, 59556:15791).
 *
 * A custom dropdown, because the design specifies one. A native `<select>` was
 * the first implementation and it was wrong: `appearance-none` hides the arrow
 * but the *list* is still drawn by the OS, so it ignores the design entirely —
 * wrong typeface, wrong row height, wrong everything, and different on every
 * platform.
 *
 * ── The shape the design specifies ──────────────────────────────────────────
 * Opening does not float a popover next to the field; the **field itself
 * becomes the panel**. Same 16px radius, same 1px border, same 24px horizontal
 * padding. The value row turns into a header with a bottom rule and a flipped
 * chevron, and the options list appears beneath it.
 *
 *   panel     px-24 py-17, gap 12, radius 16, border `line`
 *   header    pb-12, bottom border `line`, label 16 Regular `ink-label`
 *   option    h-32, label 14 Medium `ink-900`, +0.005em tracking
 *
 * The option tracking is the same +0.005em exception as `SelectChip` — see the
 * `--tracking-chip` note in globals.css.
 *
 * The panel is absolutely positioned so opening it does not reflow the card. In
 * the design it simply replaces the field, which works on a static frame; in a
 * live form it would shove everything below it down the page on every open.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/shell/Icon";
import { cn } from "@/lib/cn";

export function Select({
  id,
  value,
  options,
  placeholder,
  disabled,
  borderClass,
  onChange,
  describedBy,
}: {
  id?: string;
  value: string;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  /** Border colour from the field's state, so error/verified still read. */
  borderClass: string;
  onChange: (value: string) => void;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = value || placeholder || "Select";

  return (
    <div ref={root} className="relative w-full">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[3.4375rem] w-full items-center justify-between gap-10 rounded-xl border bg-surface px-6 transition-colors",
          borderClass,
          disabled && "cursor-not-allowed bg-field-disabled",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left text-16 font-text",
            value ? "text-ink-900" : "text-ink-400",
          )}
        >
          {label}
        </span>
        <Icon src="chevron-down-field.svg" width={16} height={16} />
      </button>

      {open && !disabled ? (
        <div
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 top-0 z-30 flex w-full flex-col items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface px-6 py-[1.0625rem] shadow-card"
        >
          <div className="flex w-full items-center justify-between border-b border-line pb-3">
            <span className="text-16 font-text capitalize text-ink-label">{label}</span>
            <span className="flex -scale-y-100 items-center justify-center">
              <Icon src="section-chevron.svg" width={24} height={24} />
            </span>
          </div>

          <div className="flex max-h-[15rem] w-full flex-col gap-1 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-8 w-full shrink-0 items-center gap-2 text-left",
                  "text-14 leading-5 tracking-chip font-text font-medium whitespace-nowrap",
                  option === value ? "text-brand" : "text-ink-900",
                )}
              >
                {option}
              </button>
            ))}
            {options.length === 0 ? (
              <p className="py-2 text-12 font-text text-ink-400">Nothing to choose from yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
