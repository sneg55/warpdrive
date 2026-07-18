import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

export { metadata } from "@/constants/siteMetadata";

// Inter is vendored (./fonts) and loaded via next/font/local, so there is no build-time or runtime
// request to Google Fonts. The latin variable subset covers Western-European text; missing glyphs
// fall back to the system stack. Exposes `--font-inter` for globals.css. Matches the app so the
// marketing chrome and the product screenshots share one typeface.
const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
