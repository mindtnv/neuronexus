import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NeuroNexus",
    short_name: "NeuroNexus",
    description: "Anki reimagined — graph, garden, AI.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Desktop (Chromium) installed PWA: let the app draw into the OS titlebar —
    // window controls overlay the viewport, the in-app topbar becomes the
    // draggable titlebar (see [data-wco] in globals.css). Unsupported browsers
    // (Safari "Add to Dock") ignore this and fall back to `display`.
    display_override: ["window-controls-overlay"],
    background_color: "#0a0b0d",
    theme_color: "#111317",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
