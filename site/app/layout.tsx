import type { ReactNode } from "react";
import localFont from "next/font/local";
import Script from "next/script";
import { AHREFS_ANALYTICS_KEY, GA_MEASUREMENT_ID } from "@/constants/siteMetadata";
import "./globals.css";

export { metadata } from "@/constants/siteMetadata";

const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

const ANALYTICS_STRATEGY = "lazyOnload";

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body>{children}</body>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy={ANALYTICS_STRATEGY}
      />
      <Script id="gtag-init" strategy={ANALYTICS_STRATEGY}>
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
      <Script
        src="https://analytics.ahrefs.com/analytics.js"
        data-key={AHREFS_ANALYTICS_KEY}
        strategy={ANALYTICS_STRATEGY}
      />
    </html>
  );
}
