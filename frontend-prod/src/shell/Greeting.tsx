/**
 * shell/Greeting.tsx — Figma 59525:9751 and the agent tiles at 59525:9758.
 * DISPOSABLE.
 *
 * The tiles are the platform app's agent picker. "Use CR/CO Agent" is the only
 * one wired here — it is what hands control to the agent, after which every
 * subsequent screen comes from the contract rather than from this file.
 */
import { Icon } from "./Icon";

const TILES = [
  { label: "Use SASA Agent", icon: "agent-sasa.svg", iconSize: 16, chip: "bg-chip-blue", chevron: true },
  { label: "Workshop Assist", icon: "agent-workshop.svg", iconSize: 16, chip: "bg-chip-amber", chevron: true },
  { label: "Use CR/CO Agent", icon: "agent-crco.svg", iconSize: 20, chip: "bg-chip-green", chevron: false },
] as const;

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
  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex w-full max-w-[71.4375rem] flex-col items-start justify-center gap-3">
        <p className="text-16 font-text text-ink-500 whitespace-nowrap">
          What do you want to proceed with?
        </p>
        <div className="flex w-full items-start gap-3">
          {TILES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={t.label === "Use CR/CO Agent" ? onStartCr : undefined}
              className="flex shrink-0 items-center gap-3 overflow-clip rounded-lg border border-line bg-surface p-3"
            >
              <span
                className={`flex items-center justify-center overflow-clip rounded-chip p-[0.3125rem] ${t.chip} ${
                  t.iconSize === 20 ? "size-[1.625rem]" : ""
                }`}
              >
                <Icon src={t.icon} width={t.iconSize} height={t.iconSize} />
              </span>
              <span className="text-16 font-text font-medium leading-normal tracking-normal text-ink-900 whitespace-nowrap">
                {t.label}
              </span>
              {t.chevron ? <Icon src="chevron-right.svg" width={16} height={16} /> : null}
            </button>
          ))}

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
      </div>
    </div>
  );
}
