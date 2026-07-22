import posthog from "posthog-js";
import { sanitizeErrorEmails, scrubProperties } from "./scrub";

interface Identity {
  id: string;
  name: string;
  email: string;
  role: string;
}

let ready = false;
let warned = false;
// The last requested identity, kept so an identify that arrives before telemetry is ready (React
// runs child effects before parent effects, so IdentifyUser can fire before TelemetryProvider's
// posthog.init + markReady) is replayed once ready, instead of being silently dropped.
let pendingIdentity: Identity | null = null;

function failOpen(e: unknown): void {
  if (warned) return;
  warned = true;
  console.warn("[telemetry] client capture failed, telemetry degraded", e);
}

function doIdentify(u: Identity): void {
  // Person properties are the internal employee, not a third-party contact, so NOT scrubbed.
  try {
    posthog.identify(u.id, { name: u.name, email: u.email, role: u.role });
  } catch (e) {
    failOpen(e);
  }
}

export function markReady(value: boolean): void {
  ready = value;
  // Replay an identity requested before init landed (see pendingIdentity above).
  if (value && pendingIdentity !== null) doIdentify(pendingIdentity);
}

export function currentRoute(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

export function capture(name: string, props: Record<string, unknown> = {}): void {
  if (!ready) return;
  try {
    posthog.capture(name, scrubProperties(props));
  } catch (e) {
    failOpen(e);
  }
}

export function captureException(error: unknown, ctx: Record<string, unknown> = {}): void {
  if (!ready) return;
  try {
    // posthog derives $exception_list from the raw error, bypassing the ctx scrub, so redact emails
    // from the error payload itself as well.
    posthog.captureException(sanitizeErrorEmails(error), scrubProperties(ctx));
  } catch (e) {
    failOpen(e);
  }
}

export function identifyUser(u: Identity): void {
  // Remember the request even if telemetry is not ready yet; markReady replays it.
  pendingIdentity = u;
  if (!ready) return;
  doIdentify(u);
}

export function resetIdentity(): void {
  // Drop the buffered identity so a signed-out user is not re-identified when telemetry becomes
  // ready later.
  pendingIdentity = null;
  if (!ready) return;
  try {
    posthog.reset();
  } catch (e) {
    failOpen(e);
  }
}
