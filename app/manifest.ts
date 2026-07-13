import type { MetadataRoute } from "next";

// PWA manifest — required for installable app + iOS home-screen push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fiable",
    short_name: "Fiable",
    description: "Inventario, ventas y fiados",
    start_url: "/ventas",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
