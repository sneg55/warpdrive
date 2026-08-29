// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichLoading } from "./EnrichLoading";

afterEach(cleanup);

test("announces the wait as a live status rather than a silent block of grey", () => {
  render(<EnrichLoading />);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent(ENRICHMENT_STRINGS.dialog.loading);
  expect(status).toHaveAttribute("aria-busy", "true");
});

test("each placeholder row sweeps on its own beat instead of pulsing in lockstep", () => {
  render(<EnrichLoading />);
  const rows = screen.getAllByTestId("enrich-loading-row");
  expect(rows.length).toBeGreaterThan(2);
  const delays = rows.map((r) => r.style.getPropertyValue("--enrich-stagger"));
  expect(new Set(delays).size).toBe(rows.length);
  expect(delays[0]).toBe("0ms");
});

test("a placeholder row mirrors the field row it stands in for, so nothing jumps on arrival", () => {
  render(<EnrichLoading />);
  const row = screen.getAllByTestId("enrich-loading-row")[0];
  expect(row?.className).toContain("grid-cols-[auto_8rem_1fr]");
});

test("the sweep is animation, not layout, and stops under reduced motion", () => {
  render(<EnrichLoading />);
  const sweeps = screen.getAllByTestId("enrich-loading-sweep");
  expect(sweeps.length).toBeGreaterThan(0);
  for (const sweep of sweeps) {
    expect(sweep.className).toContain("animate-shimmer");
    expect(sweep.className).toContain("motion-reduce:animate-none");
  }
});
