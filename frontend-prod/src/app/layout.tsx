import type { Metadata } from "next";
import { johnsonDisplay, johnsonText } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI SDLC Orchestration",
  description: "CR/CO Agent — agent-driven UI over AG-UI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${johnsonDisplay.variable} ${johnsonText.variable}`}>
      <body>{children}</body>
    </html>
  );
}
