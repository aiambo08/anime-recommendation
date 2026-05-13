import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anime Recommendation Nexus",
  description:
    "Neural Terminal — KNN, PMF, BMF & NCF recommendation models visualised in a cyberpunk interface.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect for Google Fonts (loaded via CSS @import) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased min-h-dvh overflow-x-hidden">
        {/* Global CRT scan beam */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5
                     bg-gradient-to-r from-transparent via-knn to-transparent
                     opacity-30 animate-scan"
          style={{ animationDuration: "8s" }}
        />
        {children}
      </body>
    </html>
  );
}
