import { afterEach, expect, it, vi } from "vitest";

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock("./capture", () => ({ capture: captureMock, currentRoute: () => "/p" }));

import { installConsoleForwarding } from "./consoleForwarding";

afterEach(() => vi.clearAllMocks());

it("forwards warn/error once per unique message and restores console", () => {
  const originalWarn = console.warn;
  const uninstall = installConsoleForwarding();
  console.warn("dup");
  console.warn("dup"); // deduped
  console.error("bad");
  expect(captureMock).toHaveBeenCalledTimes(2);
  expect(captureMock).toHaveBeenCalledWith("client_console", {
    level: "warn",
    message: "dup",
    route: "/p",
  });
  uninstall();
  expect(console.warn).toBe(originalWarn);
});
