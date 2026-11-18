import localFont from "next/font/local";
import type { ReactNode } from "react";
import "react-day-picker/style.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { env } from "@/config/env";
import { STRINGS } from "@/constants/strings";
import { TelemetryProvider } from "@/features/observability/TelemetryProvider";
import { WebVitalsReporter } from "@/features/observability/WebVitalsReporter";
import { AppearanceSync } from "@/features/theme/AppearanceSync";
import { appearanceScript } from "@/features/theme/appearance";

const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: { default: STRINGS.app.name, template: `%s · ${STRINGS.app.name}` },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed, non-user string; must be inline to beat first paint
          dangerouslySetInnerHTML={{ __html: appearanceScript() }}
        />
        <AppearanceSync />
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
