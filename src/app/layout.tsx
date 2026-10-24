import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/dashboard/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Berthwise — Port costs, before you berth",
  description:
    "Instant port charge calculations, AI-powered port insights, and comprehensive tariff data for maritime operators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <template dangerouslySetInnerHTML={{ __html: '<!-- THESIS: A focused maritime chat workspace, with conversation as the primary task. OWN-WORLD: shadcn Nova controls, neutral surfaces, Geist, restrained teal, equivalent light and dark themes. STORY: Start a port question, supply vessel details, read and revisit the answer. FIRST VIEWPORT: Compact history sidebar, quiet header, centered welcome and rounded composer; the active conversation shares that reading column. FORM: Codex-inspired focus composition; user-delegated choice, pinned brief overrides seed 2907173a. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->' }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
