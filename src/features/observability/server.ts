import { PostHog } from "posthog-node";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { sanitizeErrorEmails, scrubProperties } from "./scrub";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (env.DISABLE_TELEMETRY || env.POSTHOG_KEY.length === 0 || env.POSTHOG_HOST.length === 0) {
    return null;
  }
  if (client === null) {
    client = new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST, flushAt: 1, flushInterval: 0 });
  }
  return client;
}

export function captureServer(
  actorId: string | null,
  name: string,
  props: Record<string, unknown>,
  signal?: AbortSignal,
): void {
  if (signal?.aborted === true) return;
  const c = getClient();
  if (c === null) return;
  try {
    c.capture({
      distinctId: actorId ?? "anonymous",
      event: name,
      properties: scrubProperties(props),
    });
  } catch (e) {
    console.warn("[telemetry] server capture failed", e);
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
    // errorId is derived from the original error above; the payload handed to captureException is
    // email-redacted because posthog-node builds $exception_list from the raw error.
    c.captureException(
      sanitizeErrorEmails(error),
      actorId ?? "anonymous",
      scrubProperties({ ...props, errorId }),
    );
  } catch (e) {
    console.warn("[telemetry] server capture failed", e);
  }
}
