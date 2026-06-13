// PWA / app-shell metadata for the root layout.
//
// These exports live in a side-effect-free module (no React, no next/font, no
// providers) so they can be imported in isolation — both by `layout.tsx` (which
// re-exports them) and by unit tests that must not pull client-only code into a
// happy-dom/bun harness. Next.js reads `metadata` / `viewport` via the re-export
// from `layout.tsx`, so the runtime behavior is unchanged.

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "NeuroNexus",
  description: "Anki reimagined — graph, garden, AI.",
  applicationName: "NeuroNexus",
  appleWebApp: {
    capable: true,
    title: "NeuroNexus",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#111317" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};
