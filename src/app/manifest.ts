import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SRM Voice Log - سجل إدارة الموردين",
    short_name: "SRM Voice",
    description: "سجل متابعة الموردين بالصوت — Log supplier-relationship work by voice",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fcf6f1",
    theme_color: "#962b5b",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

