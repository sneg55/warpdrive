import { afterEach, expect, it, vi } from "vitest";

const { afterFn, afterQueue, captureServerTimingFn, requestHeaders, telemetry } = vi.hoisted(() => {
  const queue: (() => void)[] = [];
  return {
    afterQueue: queue,
    afterFn: vi.fn((fn: () => void) => {
      queue.push(fn);
    }),
    captureServerTimingFn: vi.fn(),
    requestHeaders: { current: new Headers() },
    telemetry: { enabled: true },
  };
});
vi.mock("next/server", () => ({ after: afterFn }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(requestHeaders.current) }));
vi.mock("./server", () => ({
  captureServerTiming: captureServerTimingFn,
  serverTelemetryEnabled: () => telemetry.enabled,
}));

import { timed, timingRoute } from "./serverTiming";

function flushAfterQueue(): void {
  for (const flush of afterQueue.splice(0)) flush();
}

afterEach(() => {
  vi.clearAllMocks();
  requestHeaders.current = new Headers();
  telemetry.enabled = true;
});

it("timed hands the page span to after() and reports it as a page server_timing event", async () => {
  expect(await timed("leads.data", () => Promise.resolve("rows"))).toBe("rows");
  expect(captureServerTimingFn).not.toHaveBeenCalled();
  flushAfterQueue();

  expect(afterFn).toHaveBeenCalledTimes(1);
  expect(captureServerTimingFn).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "page",
      spans: {
        "leads.data": {
          start_ms: expect.any(Number) as unknown,
          dur_ms: expect.any(Number) as unknown,
        },
      },
    }),
  );
});

it("timingRoute labels the page event with its route template", async () => {
  await timingRoute("/deals/[dealId]");
  flushAfterQueue();
  expect(captureServerTimingFn).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "page", route: "/deals/[dealId]" }),
  );
});

it("does no timing work for a request that asks not to be tracked, and still returns the work's value", async () => {
  requestHeaders.current = new Headers({ DNT: "1" });
  expect(await timed("leads.data", () => Promise.resolve("rows"))).toBe("rows");
  await timingRoute("/leads");
  expect(afterFn).not.toHaveBeenCalled();
});

it("does no timing work when server telemetry is not configured", async () => {
  telemetry.enabled = false;
  expect(await timed("leads.data", () => Promise.resolve("rows"))).toBe("rows");
  await timingRoute("/leads");
  expect(afterFn).not.toHaveBeenCalled();
});
