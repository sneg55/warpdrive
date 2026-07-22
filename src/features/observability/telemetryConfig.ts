export interface TelemetryClientConfig {
  key: string;
  host: string;
  release: string;
  commit: string;
  disabled: boolean;
  // Forwarding console.warn/error to PostHog is off by default (per the design spec); the
  // operator opts in via TELEMETRY_CONSOLE_FORWARDING because it widens the event surface.
  consoleForwarding: boolean;
}

export function telemetryEnabled(
  cfg: Pick<TelemetryClientConfig, "key" | "host" | "disabled">,
): boolean {
  return !cfg.disabled && cfg.key.length > 0 && cfg.host.length > 0;
}

export function doNotTrackEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.doNotTrack === "1";
}
