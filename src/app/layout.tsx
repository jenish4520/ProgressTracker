import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerBridge from "@/components/ServiceWorkerBridge";

export const metadata: Metadata = {
  title: "ProgressTracker",
  description: "Track training, food and bodyweight — and see what is actually changing.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Progress" },
  // A personal log has no business in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available: pinch-to-zoom is an accessibility feature, not a
  // layout bug to suppress.
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerBridge />
        {children}
      </body>
    </html>
  );
}
