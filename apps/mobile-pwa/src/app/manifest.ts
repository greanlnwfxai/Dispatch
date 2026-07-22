import type { MetadataRoute } from "next";

/**
 * PWA-ready metadata structure (TDR-MOBILE-001). No brand icon artwork is
 * included in DEV-FOUNDATION-001 per scope — `icons` is intentionally
 * omitted rather than filled with placeholder images.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dispatch Mobile/PWA",
    short_name: "Dispatch",
    description:
      "Dispatch Internal Delivery Mobile/PWA — foundation build (DEV-FOUNDATION-001), no business workflow yet.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
  };
}
