export interface TelemetryClientConfig {
  key: string;
  host: string;
  release: string;
  commit: string;
  disabled: boolean;
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
