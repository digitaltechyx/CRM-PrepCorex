import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PrepCorex CRM",
    short_name: "PrepCorex CRM",
    description: "CRM, private notes, to-do reminders, leads, quotes, and invoices.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f5f5",
    theme_color: "#312e81",
    orientation: "any",
    icons: [
      {
        src: "/PCX%20Testing-11.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/PCX%20Testing-11.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "My notes & to-do",
        short_name: "My tasks",
        url: "/dashboard/tasks",
        icons: [{ src: "/PCX%20Testing-11.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "CRM dashboard",
        short_name: "Dashboard",
        url: "/dashboard",
        icons: [{ src: "/PCX%20Testing-11.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}

