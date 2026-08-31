import type { Metadata } from "next";
import { johnsonDisplay, johnsonText } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "CR/CO Agent",
  description: "Controlled-UI frontend for the SolMan CR/CO agent.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
     * The two font variables are declared here and consumed by `--font-display`
     * and `--font-text` in globals.css. `next/font/local` self-hosts the faces
     * from this origin, which is what lets the CSP say `font-src 'self'` with
     * no exception — a Google Fonts link would have required one.
     *
     * It also removes the layout shift a webfont normally causes: the metrics
     * are read at build time and a matching fallback is generated.
     */
    <html lang="en" className={`${johnsonDisplay.variable} ${johnsonText.variable}`}>
      <body>{children}</body>
    </html>
  );
}
