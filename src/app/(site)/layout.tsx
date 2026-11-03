import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Newsreader } from "next/font/google";
import "./globals.css";

// Lassie pairs ABC Marist (commercial) with DM Sans / DM Mono.
// Newsreader is the open-licence stand-in for Marist until a licence is bought.
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-dm-mono" });

export const metadata: Metadata = {
  title: "Berthwise — Port costs, before you call",
  description:
    "Estimate and compare port-call costs across Indian ports in minutes, from published scales of rates.",
};

export const viewport: Viewport = { themeColor: "#f7f5ec" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${dmSans.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Lets CSS hide intro elements (and show the loader) before hydration, but not when JS is off. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js','is-loading')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
