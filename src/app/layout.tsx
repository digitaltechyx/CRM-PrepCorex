import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegistration } from "@/components/pwa-registration";

/** Avoid static prerender issues with client auth shell on system routes like 404. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PrepCorex CRM",
  description: "CRM, personal notes, reminders, leads, contacts, quotes, and invoices",
  manifest: "/manifest.webmanifest",
  applicationName: "PrepCorex CRM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PrepCorex CRM",
  },
  icons: {
    icon: [{ url: "/PCX%20Testing-11.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          <PwaRegistration />
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
