import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Our type steps are named by pixel size (`text-16`, `text-24` — see D4), which
 * collides with how tailwind-merge disambiguates the `text-*` prefix.
 *
 * It has no way to know `text-14` is a font size rather than a colour, so it
 * files it under colours and drops it as conflicting the moment a real colour is
 * merged in the same call:
 *
 *     cn("text-14 …", "text-ink-900")   →   "… text-ink-900"     // 14px lost
 *
 * Silently. No error, and the class simply is not in the output. It is
 * especially nasty for `text-16`, where the result is indistinguishable from
 * working because 16px is the inherited default.
 *
 * Declaring the steps here puts them in the font-size group, so a size and a
 * colour coexist and only two sizes conflict.
 *
 * **Any new step added to `globals.css` must be added here too.** The contract
 * test guards the pairing.
 */
export const TYPE_STEPS = ["10", "12", "14", "16", "20", "24", "64"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_STEPS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
