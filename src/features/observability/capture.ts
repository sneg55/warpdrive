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
let pendingIdentity: Identity | null = null;

function failOpen(e: unknown): void {
  if (warned) return;
  warned = true;
  console.warn("[telemetry] client capture failed, telemetry degraded", e);
}

function doIdentify(u: Identity): void {
  try {
    posthog.identify(u.id, { name: u.name, email: u.email, role: u.role });
  } catch (e) {
    failOpen(e);
  }
}

const readyWaiters = new Set<() => void>();

export function markReady(value: boolean): void {
  ready = value;
  if (value && pendingIdentity !== null) doIdentify(pendingIdentity);
  if (value && readyWaiters.size > 0) {
    const waiters = [...readyWaiters];
    readyWaiters.clear();
    for (const w of waiters) w();
  }
}

export function whenReady(fn: () => void): () => void {
  if (ready) {
    fn();
    return () => {};
  }
  readyWaiters.add(fn);
  return () => readyWaiters.delete(fn);
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
    posthog.captureException(sanitizeErrorEmails(error), scrubProperties(ctx));
  } catch (e) {
    failOpen(e);
  }
}

export function identifyUser(u: Identity): void {
  pendingIdentity = u;
  if (!ready) return;
  doIdentify(u);
}

export function resetIdentity(): void {
  pendingIdentity = null;
  if (!ready) return;
  try {
    posthog.reset();
  } catch (e) {
    failOpen(e);
  }
}
