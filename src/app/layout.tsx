import localFont from "next/font/local";
import type { ReactNode } from "react";
// react-day-picker base styles must load before globals.css so the token overrides
// there (`.rdp-root { ... }`) win. Without this the calendar renders unstyled.
import "react-day-picker/style.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { env } from "@/config/env";
import { STRINGS } from "@/constants/strings";
import { TelemetryProvider } from "@/features/observability/TelemetryProvider";
import { WebVitalsReporter } from "@/features/observability/WebVitalsReporter";

// Pipedrive parity C1: Inter is the app typeface. The woff2 is VENDORED in ./fonts and loaded via
// next/font/local, so there is NO build-time or runtime request to Google Fonts (next/font/google
// fetches from Google during `next build`, which breaks the offline / single-box-deploy posture).
// The latin variable subset (U+0000-00FF) covers Western-European text; any glyph it lacks falls
// back to the system stack (one @font-face, so no tofu). Exposes `--font-inter` for globals.css.
const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

// Child routes set a bare title (e.g. "Pipeline"); the template appends the app
// name so every tab reads "<where> · Warpdrive". Routes with no title fall back
// to `default`.
export const metadata = {
  title: { default: STRINGS.app.name, template: `%s · ${STRINGS.app.name}` },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body>
        <TelemetryProvider
          config={{
            key: env.POSTHOG_KEY,
            host: env.POSTHOG_HOST,
            release: env.APP_VERSION,
            commit: env.APP_COMMIT,
            disabled: env.DISABLE_TELEMETRY,
            consoleForwarding: env.TELEMETRY_CONSOLE_FORWARDING,
          }}
        >
          <WebVitalsReporter />
          <Providers>{children}</Providers>
        </TelemetryProvider>
      </body>
    </html>
  );
}
