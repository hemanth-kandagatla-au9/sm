/**
 * A live readout of everything that feeds the root-size rule in globals.css.
 *
 * The UI scales with viewport width (D17), so "it looks too big" can mean three
 * different things — a small CSS viewport, a high device pixel ratio, or browser
 * zoom — and they need opposite fixes. Guessing between them wastes a round trip
 * each time. This prints the actual numbers.
 */
"use client";

import { useEffect, useState } from "react";

interface Reading {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  rootPx: number;
  scale: number;
  physicalWidth: number;
  zoomHint: string;
}

function read(): Reading {
  const cssWidth = window.innerWidth;
  const dpr = window.devicePixelRatio;
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return {
    cssWidth,
    cssHeight: window.innerHeight,
    dpr,
    rootPx,
    scale: rootPx / 16,
    physicalWidth: Math.round(cssWidth * dpr),
    // Browser zoom and OS display scaling both land in devicePixelRatio, so
    // this is a hint rather than a measurement — but a dpr that is not a clean
    // 1, 1.25, 1.5 or 2 usually means browser zoom is involved.
    zoomHint: [1, 1.25, 1.5, 2, 3].includes(dpr) ? "no browser zoom (or an exact step)" : "browser zoom is likely active",
  };
}

export function ViewportReadout() {
  const [r, setR] = useState<Reading | null>(null);

  useEffect(() => {
    const update = () => setR(read());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!r) return null;

  const rows: [string, string][] = [
    ["CSS viewport", `${r.cssWidth} × ${r.cssHeight}`],
    ["devicePixelRatio", String(r.dpr)],
    ["physical width", `${r.physicalWidth}px`],
    ["root font-size", `${r.rootPx.toFixed(2)}px`],
    ["UI scale vs design", `${(r.scale * 100).toFixed(1)}%`],
    ["reference width", "1512px → root 16px"],
    ["zoom", r.zoomHint],
  ];

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <p className="mb-4 text-12 font-text font-medium uppercase text-ink-400">
        Viewport &amp; scale — read this to me
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-12 font-text text-ink-500">{k}</dt>
            <dd className="text-12 font-text font-medium tabular-nums text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-10 font-text text-ink-400">
        Resize the window and these update live.
      </p>
    </div>
  );
}
