"use client";
import { useReportWebVitals } from "next/web-vitals";
import { capture } from "./capture";

// Only the fields we forward. Typed locally because Next's callback metric comes from a compiled
// module the type-aware linter cannot resolve; this structural supertype keeps the callback
// assignable while giving lint a concrete type (avoids no-unsafe-member-access).
interface WebVitalMetric {
  name: string;
  value: number;
  id: string;
  rating: string;
}

// Emits a flat, queryable `web_vital` event per metric (LCP/CLS/INP/FCP/TTFB) alongside PostHog's
// built-in $web_vitals autocapture. Rendered once in the root layout so it lives under
// TelemetryProvider. `capture` self-guards on telemetry readiness (no-op until posthog.init lands
// and when telemetry is disabled), so no extra gate is needed here.
export function WebVitalsReporter(): null {
  useReportWebVitals((metric: WebVitalMetric) => {
    // Key is `metric`, not `name`: the scrubber (scrub.ts PII_KEY_RE) redacts any key matching
    // /name/i, which would collapse every event to metric "[redacted]" and lose the LCP/CLS/INP
    // identity this event exists to record.
    capture("web_vital", {
      metric: metric.name,
      value: metric.value,
      id: metric.id,
      rating: metric.rating,
    });
  });
  return null;
}
