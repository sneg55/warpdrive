import { afterEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));

import { capture, captureException, identifyUser, markReady, resetIdentity } from "./capture";

afterEach(() => {
  markReady(false);
  resetIdentity(); // clear any buffered identity so it cannot leak into the next test
  vi.clearAllMocks();
});

describe("capture facade", () => {
  it("no-ops until ready", () => {
    capture("x", { a: 1 });
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("captures scrubbed props once ready", () => {
    markReady(true);
    capture("x", { email: "a@b.com", route: "/p" });
    expect(posthog.capture).toHaveBeenCalledWith("x", { email: "[redacted]", route: "/p" });
  });

  it("identify passes person props unscrubbed (the internal user)", () => {
    markReady(true);
    identifyUser({ id: "u1", name: "Nick", email: "nick@example.com", role: "admin" });
    expect(posthog.identify).toHaveBeenCalledWith("u1", {
      name: "Nick",
      email: "nick@example.com",
      role: "admin",
    });
  });

  it("swallows SDK errors (fail-open)", () => {
    markReady(true);
    posthog.capture.mockImplementationOnce(() => {
      throw new Error("network");
    });
    expect(() => capture("x")).not.toThrow();
  });

  it("resetIdentity calls posthog.reset", () => {
    markReady(true);
    resetIdentity();
    expect(posthog.reset).toHaveBeenCalled();
  });

  it("captureException forwards a sanitized error to posthog", () => {
    markReady(true);
    captureException(new Error("boom for a@b.com"), { route: "/p" });
    const [passed, ctx] = posthog.captureException.mock.calls[0] as [Error, unknown];
    // The exception payload itself is scrubbed of emails, not just the ctx props: posthog derives
    // $exception_list from the raw error, which bypasses the ctx scrub.
    expect(passed.message).toBe("boom for [email]");
    expect(ctx).toEqual({ route: "/p" });
  });

  it("buffers an identify requested before ready and flushes it once ready", () => {
    // Effects run child-first, so IdentifyUser (a nested child) can call identifyUser before the
    // ancestor TelemetryProvider effect calls markReady(true). The identity must not be dropped.
    identifyUser({ id: "u1", name: "Nick", email: "nick@example.com", role: "admin" });
    expect(posthog.identify).not.toHaveBeenCalled();
    markReady(true);
    expect(posthog.identify).toHaveBeenCalledWith("u1", {
      name: "Nick",
      email: "nick@example.com",
      role: "admin",
    });
  });

  it("does not re-identify a reset user when telemetry later becomes ready", () => {
    identifyUser({ id: "u1", name: "Nick", email: "nick@example.com", role: "admin" });
    resetIdentity();
    markReady(true);
    expect(posthog.identify).not.toHaveBeenCalled();
  });
});
