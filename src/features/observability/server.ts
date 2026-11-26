import { PostHog } from "posthog-node";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { sanitizeErrorEmails, scrubProperties } from "./scrub";

let client: PostHog | null = null;
let timingClient: PostHog | null = null;

const TIMING_FLUSH_AT_EVENTS = 20;
const TIMING_FLUSH_INTERVAL_MS = 10_000;

export function serverTelemetryEnabled(): boolean {
  return !env.DISABLE_TELEMETRY && env.POSTHOG_KEY.length > 0 && env.POSTHOG_HOST.length > 0;
}

function getClient(): PostHog | null {
  if (!serverTelemetryEnabled()) return null;
  if (client === null) {
    client = new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST, flushAt: 1, flushInterval: 0 });
  }
  return client;
}

function getTimingClient(): PostHog | null {
  if (!serverTelemetryEnabled()) return null;
  timingClient ??= new PostHog(env.POSTHOG_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: TIMING_FLUSH_AT_EVENTS,
    flushInterval: TIMING_FLUSH_INTERVAL_MS,
  });
  return timingClient;
}

export interface TimingSpan {
  start_ms: number;
  dur_ms: number;
}

export interface ServerTimingEvent {
  kind: "page" | "trpc";
  route?: string;
  incomplete?: boolean;
  total_ms: number;
  spans: Record<string, TimingSpan>;
}

export function captureServerTiming(timing: ServerTimingEvent): void {
  const c = getTimingClient();
  if (c === null) return;
  try {
    c.capture({
      distinctId: "server",
      event: "server_timing",
      properties: {
        ...timing,
        release: env.APP_VERSION,
        commit: env.APP_COMMIT,
        $process_person_profile: false,
      },
    });
  } catch (e) {
    console.warn("[telemetry] server timing capture failed", e);
  }
}

export function captureServerError(
  actorId: string | null,
  error: unknown,
  props: Record<string, unknown> = {},
  signal?: AbortSignal,
): void {
  if (signal?.aborted === true) return;
  const c = getClient();
  if (c === null) return;
  const errorId =
    error instanceof AppError
      ? error.id
      : error !== null &&
          typeof error === "object" &&
          "cause" in error &&
          error.cause instanceof AppError
        ? error.cause.id
        : "";
  try {
    c.captureException(
      sanitizeErrorEmails(error),
      actorId ?? "anonymous",
      scrubProperties({ ...props, errorId }),
    );
  } catch (e) {
    console.warn("[telemetry] server capture failed", e);
  }
}
