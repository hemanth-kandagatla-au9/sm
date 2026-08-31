/**
 * ui/Icon.tsx
 *
 * Renders an icon exported from Figma at its designed size.
 *
 * Icons are the exact assets from the design file, committed under
 * public/shell/. They are not redrawn, not swapped for a lucide equivalent, and
 * not resized by a blanket descendant rule — each call states both dimensions so
 * the designed geometry survives.
 *
 * A plain <img> rather than next/image: these are static local SVGs at fixed
 * sizes, so there is nothing for the image optimiser to do, and it would add a
 * request round-trip per icon.
 */

export interface IconProps {
  /** Filename under public/shell/, e.g. "search.svg". */
  src: string;
  /** The size in Figma pixels. Converted to rem so icons scale with the UI. */
  width: number;
  height: number;
  className?: string;
  /** Only set when the icon carries meaning no adjacent text already gives. */
  alt?: string;
}

/** Figma px → rem at the 1512 reference width, where the root size is 16px. */
const rem = (px: number) => `${px / 16}rem`;

export function Icon({ src, width, height, className, alt = "" }: IconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/shell/${src}`}
      // The px attributes give the intrinsic aspect ratio and prevent layout
      // shift before CSS applies; the rem style is what actually sizes it, so
      // icons scale with the root size rather than staying pinned at 16px.
      width={width}
      height={height}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      className={className}
      style={{ width: rem(width), height: rem(height) }}
    />
  );
}
