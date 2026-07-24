"use client";
import posthog from "posthog-js";
import type React from "react";
import { useEffect } from "react";
import { markReady } from "./capture";
import { installConsoleForwarding } from "./consoleForwarding";
import { installGlobalHandlers } from "./errorForwarding";
import { sessionRecordingOptions } from "./replayMasking";
import { scrubEvent } from "./scrub";
import { doNotTrackEnabled, type TelemetryClientConfig, telemetryEnabled } from "./telemetryConfig";

// Initializes posthog-js exactly once. Mounted in the ROOT layout (src/app/layout.tsx) so that
// telemetry is live regardless of whether the authenticated (app) layout renders: a crash inside
// (app)/layout.tsx (context hydration, DB failure) then still reaches PostHog via global-error.tsx,
// which relies on the singleton already being ready. Identity is set separately (IdentifyUser),
// because the root layout has no authenticated actor.
export function TelemetryProvider({
  config,
  children,
}: {
  config: TelemetryClientConfig;
  children: React.ReactNode;
}): React.ReactNode {
  // Destructure to primitive locals so the effect captures stable fields, not the fresh config
  // object literal the server layout allocates each render.
  const { key, host, release, commit, disabled, consoleForwarding } = config;
  useEffect(() => {
    if (!telemetryEnabled({ key, host, disabled }) || doNotTrackEnabled()) return;
    posthog.init(key, {
      api_host: host,
      person_profiles: "identified_only",
      autocapture: true,
      // "history_change" also captures client-side SPA navigations; `true` would only fire on the
      // initial document load, and this provider lives in a persistent layout that never remounts.
      capture_pageview: "history_change",
      capture_pageleave: true,
      // Autocapture Core Web Vitals (LCP/CLS/INP/FCP/TTFB) as $web_vitals events so prod perf is
      // queryable without extra client code; the WebVitalsReporter adds a flat `web_vital` event too.
      capture_performance: { web_vitals: true },
      session_recording: sessionRecordingOptions,
      // before_send must never throw into the SDK; keep telemetry fail-open even if scrubbing does.
      before_send: (event) => {
        try {
          return scrubEvent(event);
        } catch {
          return event;
        }
      },
      loaded: (ph) => ph.register({ release, commit }),
    });
    markReady(true);
    const uninstallErrors = installGlobalHandlers();
    // Console forwarding is opt-in (spec): only wrap console when the operator enabled it.
    const uninstallConsole = consoleForwarding ? installConsoleForwarding() : () => {};
    return () => {
      uninstallErrors();
      uninstallConsole();
      markReady(false);
    };
  }, [key, host, release, commit, disabled, consoleForwarding]);

  return children;
}
