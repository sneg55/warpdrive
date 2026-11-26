import { afterEach, expect, it, vi } from "vitest";
import type { ErrorId } from "@/constants/errorIds";
import { AppError, ERROR_IDS } from "@/constants/errorIds";

const { captureExceptionFn, captureFn, timingClientOptions } = vi.hoisted(() => ({
  captureExceptionFn: vi.fn(),
  captureFn: vi.fn(),
  timingClientOptions: [] as { flushAt?: number }[],
}));
vi.mock("posthog-node", () => ({
  PostHog: class FakePostHog {
    constructor(
      _key: string,
      private readonly options: { flushAt?: number },
    ) {}
    captureException = captureExceptionFn;
    capture = (event: unknown): void => {
      timingClientOptions.push(this.options);
      captureFn(event);
    };
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    POSTHOG_KEY: "k",
    POSTHOG_HOST: "https://h",
    DISABLE_TELEMETRY: false,
    APP_VERSION: "2.17.0",
    APP_COMMIT: "abc1234",
  },
}));

import { captureServerError, captureServerTiming, serverTelemetryEnabled } from "./server";

afterEach(() => vi.clearAllMocks());

it("captureServerError extracts the AppError id", () => {
  const error = new AppError(ERROR_IDS.PERM_DENIED, "no");
  captureServerError("u1", error);
  expect(captureExceptionFn).toHaveBeenCalledWith(
    expect.objectContaining({ message: "no" }),
    "u1",
    expect.objectContaining({ errorId: ERROR_IDS.PERM_DENIED }),
  );
});

it("captureServerError redacts emails from the exception payload itself", () => {
  captureServerError("u1", new Error("sync failed for jane@acme.com"));
  const passed = captureExceptionFn.mock.calls[0]?.[0] as Error;
  expect(passed.message).toBe("sync failed for [email]");
});

it("captureServerError extracts the AppError id from a wrapped cause", () => {
  const error = { cause: new AppError("E_PERM_DENIED" as ErrorId, "x") };
  captureServerError("u1", error);
  expect(captureExceptionFn).toHaveBeenCalledWith(
    error,
    "u1",
    expect.objectContaining({ errorId: "E_PERM_DENIED" }),
  );
});

it("captureServerTiming sends one anonymous server_timing event with the timings as given", () => {
  captureServerTiming({
    kind: "page",
    total_ms: 812.4,
    spans: {
      layout: { start_ms: 0, dur_ms: 41.2 },
      "deal.workspace": { start_ms: 45, dur_ms: 690 },
    },
  });
  expect(captureFn).toHaveBeenCalledWith({
    distinctId: "server",
    event: "server_timing",
    properties: {
      kind: "page",
      total_ms: 812.4,
      spans: {
        layout: { start_ms: 0, dur_ms: 41.2 },
        "deal.workspace": { start_ms: 45, dur_ms: 690 },
      },
      release: "2.17.0",
      commit: "abc1234",
      $process_person_profile: false,
    },
  });
});

it("captureServerTiming batches routine timing events instead of flushing each one", () => {
  captureServerTiming({ kind: "trpc", total_ms: 1, spans: {} });
  expect(timingClientOptions.at(-1)?.flushAt).toBeGreaterThan(1);
});

it("serverTelemetryEnabled is true when a PostHog key and host are configured", () => {
  expect(serverTelemetryEnabled()).toBe(true);
});
