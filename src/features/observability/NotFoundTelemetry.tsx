"use client";
import { useEffect, useRef } from "react";
import { capture, currentRoute, whenReady } from "./capture";
import { EVENTS } from "./events";

// Records that a page rendered Not found, with the route that failed. Without this a dead deep
// link is indistinguishable from a normal page view in PostHog: only the $pageview lands, so a
// broken link (a notification pointing at a record that cannot be opened) stays invisible until a
// human reports it. `capture` self-guards on telemetry readiness.
export function NotFoundTelemetry(): null {
  // One report per mount. Strict Mode runs effect setup twice in dev, and when telemetry is
  // already ready whenReady fires synchronously, so cancellation alone cannot dedupe: the second
  // setup would count the same 404 again.
  const sent = useRef(false);
  useEffect(() => {
    // whenReady, not a bare capture: on a cold load (a dead link opened straight from an email or
    // a new tab) this child effect runs before TelemetryProvider's, and capture() would no-op.
    // The returned cancel keeps a still-pending report from firing after unmount.
    return whenReady(() => {
      if (sent.current) return;
      sent.current = true;
      capture(EVENTS.notFound, { route: currentRoute() });
    });
  }, []);
  return null;
}
