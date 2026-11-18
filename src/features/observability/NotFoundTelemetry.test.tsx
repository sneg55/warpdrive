// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type * as CaptureModule from "./capture";

const capture = vi.hoisted(() => vi.fn());
vi.mock("./capture", async (importOriginal) => {
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
  markReady(true);
  render(
    <StrictMode>
      <NotFoundTelemetry />
    </StrictMode>,
  );
  expect(capture).toHaveBeenCalledTimes(1);
});

it("still reports when telemetry becomes ready after mount (cold page load)", () => {
  render(<NotFoundTelemetry />);
  expect(capture).not.toHaveBeenCalled();

  markReady(true);
  expect(capture).toHaveBeenCalledWith(EVENTS.notFound, { route: "/deals/64dc645a" });
  expect(capture).toHaveBeenCalledTimes(1);
});
