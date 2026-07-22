import { afterEach, expect, it, vi } from "vitest";
import type { ErrorId } from "@/constants/errorIds";
import { AppError, ERROR_IDS } from "@/constants/errorIds";

const { captureExceptionFn, captureFn } = vi.hoisted(() => ({
  captureExceptionFn: vi.fn(),
  captureFn: vi.fn(),
}));
vi.mock("posthog-node", () => ({
  PostHog: class FakePostHog {
    capture = captureFn;
    captureException = captureExceptionFn;
  },
}));
vi.mock("@/config/env", () => ({
  env: { POSTHOG_KEY: "k", POSTHOG_HOST: "https://h", DISABLE_TELEMETRY: false },
}));

import { captureServer, captureServerError } from "./server";

afterEach(() => vi.clearAllMocks());

it("captures with the actor id as distinctId and scrubbed props", () => {
  captureServer("u1", "srv_event", { email: "a@b.com", path: "deal.get" });
  expect(captureFn).toHaveBeenCalledWith({
    distinctId: "u1",
    event: "srv_event",
    properties: { email: "[redacted]", path: "deal.get" },
  });
});

it("no-ops when the signal is already aborted", () => {
  const ac = new AbortController();
  ac.abort();
  captureServer("u1", "x", {}, ac.signal);
  expect(captureFn).not.toHaveBeenCalled();
});

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
  // posthog-node builds $exception_list from the raw error, bypassing the ctx-prop scrub, so the
  // error handed to captureException must already have its message redacted.
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
