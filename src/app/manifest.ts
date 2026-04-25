import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cadenza Music Studio",
    short_name: "Cadenza",
    description: "Cadenza Music Studio student CRM and producer workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0b0f",
    theme_color: "#0a0b0f",
    icons: [
      {
        src: "/cadenza-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/cadenza-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
