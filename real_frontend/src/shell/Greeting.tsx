"use client";

/**
 * shell/Greeting.tsx — Figma 59525:9751 and the agent tiles at 59525:9758.
 * DISPOSABLE.
 *
 * The tiles are the platform app's agent picker. "Use CR/CO Agent" is the only
 * one wired here — it is what hands control to the agent, after which every
 * subsequent screen comes from the contract rather than from this file.
 */
import { useState } from "react";
import { Icon } from "@/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * The agent picker.
 *
 * CR/CO is the only agent wired up, and it is the only one that opens: choosing
 * it reveals what it can actually do rather than starting something unnamed. The
 * other two carry the same chevron because the design gives them one, and they
 * open nothing until they have flows of their own.
 */
const TILES = [
  { id: "sasa", label: "Use SASA Agent", icon: "agent-sasa.svg", iconSize: 16, chip: "bg-chip-blue" },
  { id: "workshop", label: "Workshop Assist", icon: "agent-workshop.svg", iconSize: 16, chip: "bg-chip-amber" },
  { id: "crco", label: "Use CR/CO Agent", icon: "agent-crco.svg", iconSize: 20, chip: "bg-chip-green" },
] as const;

type TileId = (typeof TILES)[number]["id"];

export function Greeting({ name = "Kevin" }: { name?: string }) {
  return (
    <div className="flex w-full items-start justify-center">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-64 font-display font-bold text-ink-900">
          Hello,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              // The exact angle from the design; Tailwind's bl/br stops are not
              // the same 200.75deg and the difference is visible at 64px.
              backgroundImage:
                "linear-gradient(200.7506053071661deg, rgb(235, 132, 121) 0%, rgb(222, 40, 20) 99.951%)",
            }}
          >
            {name}
          </span>
        </h2>
        <p className="w-[46.875rem] max-w-full text-24 font-text leading-normal tracking-normal text-ink-500">
          How can I assist your workflow today?
          <br />
          Choose an agent or start typing
        </p>
      </div>
    </div>
  );
}

export function AgentTiles({ onStartCr }: { onStartCr?: () => void }) {
  /**
   * Which tile is open. One at a time: two open agents would put two sets of
   * actions on screen with nothing to say which belongs to which.
   */
  const [openTile, setOpenTile] = useState<TileId | null>(null);

  return (
    /*
     * Left-aligned, not centred.
     *
     * The Figma frame centres this group under the greeting. The client asked
     * for it against the left edge on the call of 2026-08-31 — it reads as the
     * start of the conversation that way, and it lines up with the composer
     * below it rather than floating between the two.
     */
    <div className="flex w-full flex-col items-start">
      <div className="flex w-full max-w-[71.4375rem] flex-col items-start justify-center gap-3">
        <p className="text-16 font-text text-ink-500 whitespace-nowrap">
          What do you want to proceed with?
        </p>

        <div className="flex w-full flex-wrap items-start gap-3">
          {TILES.map((t) => {
            const open = openTile === t.id;
            const opens = t.id === "crco";

            return (
              <button
                key={t.id}
                type="button"
                onClick={opens ? () => setOpenTile(open ? null : t.id) : undefined}
                aria-expanded={opens ? open : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 overflow-clip rounded-lg border bg-surface p-3",
                  "transition-colors motion-safe:duration-150",
                  open ? "border-brand-a24" : "border-line hover:border-brand-a12",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center overflow-clip rounded-chip p-[0.3125rem]",
                    t.chip,
                    t.iconSize === 20 && "size-[1.625rem]",
                  )}
                >
                  <Icon src={t.icon} width={t.iconSize} height={t.iconSize} />
                </span>
                <span className="text-16 font-text font-medium leading-normal tracking-normal text-ink-900 whitespace-nowrap">
                  {t.label}
                </span>
                <Icon
                  src={open ? "agent-chevron-up.svg" : "agent-chevron-down.svg"}
                  width={27}
                  height={16}
                />
              </button>
            );
          })}

          <button
            type="button"
            className="flex shrink-0 items-center gap-2 self-stretch overflow-clip rounded-lg border border-line bg-surface-muted p-3"
          >
            <Icon src="more-dots.svg" width={16} height={16} />
            <span className="text-16 font-text font-medium leading-normal tracking-normal text-ink-600 whitespace-nowrap">
              More
            </span>
          </button>
        </div>

        {/*
         * What the open agent can do.
         *
         * Deliberately the same row the sidebar shows under CR/CO — same icon,
         * same wording — because they are the same action reached two ways. A
         * third entry point that looked different would read as a third feature.
         *
         * It sits under the tile row rather than floating over it: a popover
         * would cover the composer, and this group is anchored to the bottom of
         * the screen where there is no room to open downwards.
         */}
        {openTile === "crco" ? (
          <div
            role="group"
            aria-label="CR/CO Agent"
            className="flex flex-wrap items-start gap-3"
          >
            <button
              type="button"
              onClick={onStartCr}
              className={cn(
                "flex shrink-0 items-center gap-3 overflow-clip rounded-lg border border-line bg-surface p-3",
                "transition-colors motion-safe:duration-150 hover:border-brand-a24 hover:bg-brand-a08",
              )}
            >
              <Icon src="doc-create-cr.svg" width={24} height={24} />
              <span className="text-16 font-text font-medium text-ink-900 whitespace-nowrap">
                Create Change Request
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
