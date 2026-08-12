// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type * as CaptureModule from "./capture";

const capture = vi.hoisted(() => vi.fn());
vi.mock("./capture", async (importOriginal) => {
  // Keep the REAL readiness gate (markReady/whenReady) and stub only the transport, so the test
  // exercises the same ordering the app has: this component's effect runs before the ancestor
  // TelemetryProvider's, because React runs child effects first.
  const actual = await importOriginal<typeof CaptureModule>();
  return { ...actual, capture, currentRoute: () => "/deals/64dc645a" };
});

import { markReady } from "./capture";
import { EVENTS } from "./events";
import { NotFoundTelemetry } from "./NotFoundTelemetry";

afterEach(() => {
  vi.clearAllMocks();
  markReady(false);
});

it("captures a not-found event with the route that failed", () => {
  // Without this, a dead deep link is indistinguishable from a normal page view in PostHog: the
  // broken notification link that motivated this only surfaced because a human hit it.
  markReady(true);
  render(<NotFoundTelemetry />);
  expect(capture).toHaveBeenCalledWith(EVENTS.notFound, { route: "/deals/64dc645a" });
});

it("captures once per mount, not once per render", () => {
  markReady(true);
  const { rerender } = render(<NotFoundTelemetry />);
  rerender(<NotFoundTelemetry />);
  expect(capture).toHaveBeenCalledTimes(1);
});

it("captures once under Strict Mode, which runs effect setup twice", () => {
  // Dev builds mount effects twice. Without a per-mount guard, an already-ready telemetry client
  // runs the callback synchronously on both setups and every dev 404 is counted twice.
  markReady(true);
  render(
    <StrictMode>
      <NotFoundTelemetry />
    </StrictMode>,
  );
  expect(capture).toHaveBeenCalledTimes(1);
});

it("still reports when telemetry becomes ready after mount (cold page load)", () => {
  // The ordering that matters: opening a dead link directly (from an email, a new tab) mounts
  // this component before TelemetryProvider's effect calls markReady, and capture() no-ops until
  // then. Dropping the event here would blind us to exactly the links people arrive on cold.
  render(<NotFoundTelemetry />);
  expect(capture).not.toHaveBeenCalled();

  markReady(true);
  expect(capture).toHaveBeenCalledWith(EVENTS.notFound, { route: "/deals/64dc645a" });
  expect(capture).toHaveBeenCalledTimes(1);
});
