import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VesperFrame",
    short_name: "VesperFrame",
    description:
      "Direct the impossible with a private image and video production workspace.",
    start_url: "/studio",
    display: "standalone",
    background_color: "#070A12",
    theme_color: "#7C5CFF",
    categories: ["photo", "video", "productivity"],
  };
}
