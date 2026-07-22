// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";

const captureExceptionMock = vi.hoisted(() => vi.fn());
vi.mock("./capture", () => ({ captureException: captureExceptionMock }));

import { forwardBoundaryError, installGlobalHandlers } from "./errorForwarding";

afterEach(() => vi.clearAllMocks());

it("forwardBoundaryError forwards with ctx", () => {
  const err = new Error("boom");
  forwardBoundaryError(err, { route: "/p", digest: "d1" });
  expect(captureExceptionMock).toHaveBeenCalledWith(err, { route: "/p", digest: "d1" });
});

it("installGlobalHandlers captures unhandled rejections and window errors", () => {
  const uninstall = installGlobalHandlers();
  window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("r") }));
  window.dispatchEvent(Object.assign(new Event("error"), { error: new Error("e") }));
  expect(captureExceptionMock).toHaveBeenCalledTimes(2);
  uninstall();
});
