// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const metric = {
  name: "LCP",
  value: 1234,
  id: "abc",
  rating: "good",
  navigationType: "soft-navigation",
};
vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (cb: (m: typeof metric) => void) => cb(metric),
}));
const capture = vi.hoisted(() => vi.fn());
vi.mock("./capture", () => ({ capture }));

import { WebVitalsReporter } from "./WebVitalsReporter";

afterEach(() => vi.clearAllMocks());

it("reports each web vital via capture with mapped props", () => {
  render(<WebVitalsReporter />);
  expect(capture).toHaveBeenCalledWith("web_vital", {
    metric: "LCP",
    value: 1234,
    id: "abc",
    rating: "good",
    navigationType: "soft-navigation",
  });
});
