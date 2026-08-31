/**
 * shell/IconRail.tsx — Figma "Side Navigation-01" (56759:62490).
 *
 * Two variants, both from the design:
 *   Variant 1  (56759:62489)  92px, J&J shorthand mark, icons only
 *   Variant 2  (56759:62491)  228px, full wordmark, icons with labels
 *
 * DISPOSABLE. See DECISIONS.md D12 and D16 — none of these destinations are in
 * scope; the rail exists so the CR/CO flow can be seen in its real context.
 */
"use client";

import { Icon } from "@/ui/Icon";
import { Tip } from "@/ui/Tooltip";
import { cn } from "@/lib/cn";
import { useShellStore } from "./useShellStore";

const RAIL_ITEMS = [
  { src: "rail-1.svg", label: "Dashboard" },
  { src: "rail-2.svg", label: "Setup" },
  { src: "rail-3.svg", label: "Projects" },
  { src: "rail-4.svg", label: "Logs & Monitoring" },
] as const;

export function IconRail({ activeIndex = 2 }: { activeIndex?: number }) {
  const railExpanded = useShellStore((s) => s.railExpanded);
  const toggleRail = useShellStore((s) => s.toggleRail);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full shrink-0 flex-col items-center overflow-clip border-r border-line bg-surface pb-6",
        // The width change is animated. The design has no transition spec — it
        // shows two static variants — so this is an inference, kept short
        // enough to read as a state change rather than an effect. See G11.
        "transition-[width] duration-200 ease-out",
        railExpanded ? "w-sidebar px-2.5" : "w-rail px-2.5",
      )}
    >
      <div className="flex w-full flex-col gap-5">
        <div
          className={cn(
            "flex h-header w-full shrink-0 items-center gap-4 border-b border-line-faint p-4",
            !railExpanded && "justify-center",
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between",
              railExpanded ? "min-w-0 flex-1" : "w-[4.25rem]",
            )}
          >
            {railExpanded ? (
              <Icon
                src="jnj-wordmark.svg"
                width={152}
                height={28.745}
                alt="Johnson &amp; Johnson"
              />
            ) : (
              <Icon
                src="jnj-logo.svg"
                width={36}
                height={36}
                alt="Johnson &amp; Johnson"
              />
            )}
            <button
              type="button"
              onClick={toggleRail}
              aria-expanded={railExpanded}
              aria-label={
                railExpanded ? "Collapse navigation" : "Expand navigation"
              }
            >
              <Icon
                src={railExpanded ? "collapse-left.svg" : "rail-collapse.svg"}
                width={24}
                height={24}
              />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "flex w-full flex-col items-center",
            railExpanded && "px-4",
          )}
        >
          <ul
            className={cn(
              "flex flex-col gap-4",
              railExpanded ? "w-full items-start" : "items-start",
            )}
          >
            {RAIL_ITEMS.map((item, i) => (
              <li
                key={item.src}
                className={railExpanded ? "w-full" : undefined}
              >
                {/*
                  Only while collapsed. Expanded, the label is beside the icon
                  already, and a tooltip repeating visible text is noise that
                  teaches people to ignore tooltips.
                */}
                <Tip label={item.label} disabled={railExpanded}>
                  <button
                    type="button"
                    aria-label={railExpanded ? undefined : item.label}
                    aria-current={i === activeIndex ? "page" : undefined}
                    className={cn(
                      "flex items-center overflow-clip rounded-md p-2",
                      railExpanded ? "w-full gap-2.5" : "justify-center",
                      // The active chip is on the collapsed variant only; the
                      // expanded variant in Figma shows no selected treatment.
                      !railExpanded &&
                        i === activeIndex &&
                        "border-[0.5px] border-line bg-surface shadow-card",
                    )}
                  >
                    <Icon src={item.src} width={20} height={20} />
                    {railExpanded ? (
                      <span className="text-16 font-text font-medium leading-normal tracking-normal text-ink-600 whitespace-nowrap">
                        {item.label}
                      </span>
                    ) : null}
                  </button>
                </Tip>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
