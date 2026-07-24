// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// Drive the callback synchronously with a fixed metric so the render asserts the exact mapping.
const metric = { name: "LCP", value: 1234, id: "abc", rating: "good" };
vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (cb: (m: typeof metric) => void) => cb(metric),
}));
const capture = vi.hoisted(() => vi.fn());
vi.mock("./capture", () => ({ capture }));

import { WebVitalsReporter } from "./WebVitalsReporter";

afterEach(() => vi.clearAllMocks());

it("reports each web vital via capture with mapped props", () => {
  render(<WebVitalsReporter />);
  // The metric identity rides on `metric`, NOT `name`: the telemetry scrubber redacts any property
  // key matching /name/i, which would turn every event into metric "[redacted]" and make LCP/CLS/INP
  // indistinguishable. Keeping the key off the PII regex preserves the metric name end to end.
  expect(capture).toHaveBeenCalledWith("web_vital", {
    metric: "LCP",
    value: 1234,
    id: "abc",
    rating: "good",
  });
});
