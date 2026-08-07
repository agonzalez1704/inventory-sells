import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/marca";

// PWA manifest — required for installable app + iOS home-screen push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: MARCA.nombre,
    short_name: MARCA.corto,
    description: MARCA.descripcion,
    start_url: "/pos",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: MARCA.themeColor,
    icons: [
      { src: MARCA.icono, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
