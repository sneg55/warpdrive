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

export function TelemetryProvider({
  config,
  children,
}: {
  config: TelemetryClientConfig;
  children: React.ReactNode;
}): React.ReactNode {
  const { key, host, release, commit, disabled, consoleForwarding } = config;
  useEffect(() => {
    if (!telemetryEnabled({ key, host, disabled }) || doNotTrackEnabled()) return;
    posthog.init(key, {
      api_host: host,
      person_profiles: "identified_only",
      autocapture: true,
      capture_pageview: "history_change",
      capture_pageleave: true,
      capture_performance: { web_vitals: true },
      session_recording: sessionRecordingOptions,
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
    const uninstallConsole = consoleForwarding ? installConsoleForwarding() : () => {};
    return () => {
      uninstallErrors();
      uninstallConsole();
      markReady(false);
    };
  }, [key, host, release, commit, disabled, consoleForwarding]);

  return children;
}
