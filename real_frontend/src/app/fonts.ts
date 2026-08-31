import localFont from "next/font/local";

/**
 * Johnson brand faces, supplied by the user as .woff.
 *
 * Coverage note: the set we were given has Display Light/Regular/Medium/Bold and
 * Text Regular/Medium/Bold. There is no Text Light. If a frame calls for it,
 * raise it rather than substituting a nearby weight.
 */
export const johnsonDisplay = localFont({
  src: [
    { path: "./fonts/JohnsonDisplay-Light.woff", weight: "300", style: "normal" },
    { path: "./fonts/JohnsonDisplay-Regular.woff", weight: "400", style: "normal" },
    { path: "./fonts/JohnsonDisplay-Medium.woff", weight: "500", style: "normal" },
    { path: "./fonts/JohnsonDisplay-Bold.woff", weight: "700", style: "normal" },
  ],
  variable: "--font-johnson-display",
  display: "swap",
});

export const johnsonText = localFont({
  src: [
    { path: "./fonts/JohnsonText-Regular.woff", weight: "400", style: "normal" },
    { path: "./fonts/JohnsonText-Medium.woff", weight: "500", style: "normal" },
    { path: "./fonts/JohnsonText-Bold.woff", weight: "700", style: "normal" },
  ],
  variable: "--font-johnson-text",
  display: "swap",
});
