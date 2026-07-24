// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({ init: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: posthog }));
const installConsole = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("./errorForwarding", () => ({ installGlobalHandlers: () => () => {} }));
vi.mock("./consoleForwarding", () => ({ installConsoleForwarding: installConsole }));

import { TelemetryProvider } from "./TelemetryProvider";

const enabled = {
  key: "k",
  host: "https://h",
  release: "1.0.0",
  commit: "abc",
  disabled: false,
  consoleForwarding: false,
};

afterEach(() => vi.clearAllMocks());

it("inits posthog when enabled", () => {
  render(
    <TelemetryProvider config={enabled}>
      <div>child</div>
    </TelemetryProvider>,
  );
  expect(posthog.init).toHaveBeenCalledWith(
    "k",
    expect.objectContaining({ api_host: "https://h" }),
  );
});

it("enables posthog web-vitals autocapture", () => {
  render(
    <TelemetryProvider config={enabled}>
      <div>child</div>
    </TelemetryProvider>,
  );
  expect(posthog.init).toHaveBeenCalledWith(
    "k",
    expect.objectContaining({ capture_performance: { web_vitals: true } }),
  );
});

it("does not init when disabled", () => {
  render(
    <TelemetryProvider config={{ ...enabled, disabled: true }}>
      <div>child</div>
    </TelemetryProvider>,
  );
  expect(posthog.init).not.toHaveBeenCalled();
});

it("installs console forwarding only when the flag is on", () => {
  render(
    <TelemetryProvider config={enabled}>
      <div>c</div>
    </TelemetryProvider>,
  );
  expect(installConsole).not.toHaveBeenCalled();
  vi.clearAllMocks();
  render(
    <TelemetryProvider config={{ ...enabled, consoleForwarding: true }}>
      <div>c</div>
    </TelemetryProvider>,
  );
  expect(installConsole).toHaveBeenCalled();
});
