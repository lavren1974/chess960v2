// Central site configuration used across the app (branding, viewer styling,
// and legal text). Adjust values here to customize behavior without touching
// individual components.
export const siteConfig = {
  // Site identity
  siteName: "chess960v2",
  siteUrl: "https://chess960v2.com",
  defaultDescription:
    "Chess960v2 is an open experiment in engine chess: thousands of games from player‑chosen Chess960 starts, with full open data and code.",
  defaultOgImage: "/img/og.png",

  // Board highlight colors for last move squares
  // Accepts any valid CSS color (hex, rgb/rgba, hsl, named color)
  highlight: {
    from: "rgba(34,197,94,0.9)", // default green
    to: "rgba(34,197,94,0.9)",  // default blue
  },

  // Copyright line. Supports {year} and {site} placeholders.
  copyright: "© {year} {site}.com. All rights reserved.",
} as const;

export function formatCopyright(template: string, siteName: string) {
  const year = String(new Date().getFullYear());
  return template.replaceAll("{year}", year).replaceAll("{site}", siteName);
}
