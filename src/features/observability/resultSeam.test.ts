import { afterEach, expect, it, vi } from "vitest";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("./capture", () => ({ capture: captureMock, currentRoute: () => "/pipeline/1" }));

import { withActionTelemetry } from "./resultSeam";

afterEach(() => vi.clearAllMocks());

it("emits app_action_failed and still calls the original reporter", () => {
  const original = vi.fn();
  const wrapped = withActionTelemetry(original, "deal");
  wrapped("E_PERM_DENIED");
  expect(captureMock).toHaveBeenCalledWith("app_action_failed", {
    errorId: "E_PERM_DENIED",
    surface: "deal",
    route: "/pipeline/1",
  });
  expect(original).toHaveBeenCalledWith("E_PERM_DENIED");
});

it("uses empty errorId when none given", () => {
  const wrapped = withActionTelemetry(vi.fn(), "app");
  wrapped(undefined);
  expect(captureMock).toHaveBeenCalledWith(
    "app_action_failed",
    expect.objectContaining({ errorId: "" }),
  );
});
