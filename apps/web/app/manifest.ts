import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AtlasQR",
    short_name: "AtlasQR",
    description:
      "Fast multilingual digital catalogs and dynamic QR experiences.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#14352B",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
