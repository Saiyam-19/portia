// Lucide glyphs (ISC) as used by the Berthwise app, inlined so the section ships no icon library.
const PATHS = {
  check: ["M20 6 9 17l-5-5"],
  chevronDown: ["m6 9 6 6 6-6"],
  arrowUp: ["m5 12 7-7 7 7", "M12 19V5"],
  plus: ["M5 12h14", "M12 5v14"],
  minus: ["M5 12h14"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  maximize: ["M15 3h6v6", "M9 21H3v-6", "m21 3-7 7", "m3 21 7-7"],
  anchor: ["M12 22V8", "M5 12H2a10 10 0 0 0 20 0h-3", "M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  ship: [
    "M12 10.189V14",
    "M12 2v3",
    "M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6",
    "M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76",
    "M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
  ],
  calculator: ["M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2", "M8 6h8", "M16 14v4", "M16 10h.01", "M12 10h.01", "M8 10h.01", "M12 14h.01", "M8 14h.01", "M12 18h.01", "M8 18h.01"],
  scale: ["m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z", "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z", "M7 21h10", "M12 3v18", "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"],
  book: ["M12 7v14", "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"],
  clock: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "M12 6v6l4 2"],
  loader: ["M21 12a9 9 0 1 1-6.219-8.56"],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M16 13H8", "M16 17H8", "M10 9H8"],
  at: ["M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0", "M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, stroke = 2 }: { name: IconName; className?: string; stroke?: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
