// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CollapsibleSection } from "./CollapsibleSection";
import { FieldRow } from "./sidebar/FieldRow";

afterEach(cleanup);

it("hides empty fields when the funnel is toggled on", () => {
  render(
    <CollapsibleSection title="Organization">
      <FieldRow label="Website">acme.com</FieldRow>
      <FieldRow label="LinkedIn" empty>
        -
      </FieldRow>
    </CollapsibleSection>,
  );
  // Both visible initially.
  expect(screen.getByText("Website")).toBeInTheDocument();
  expect(screen.getByText("LinkedIn")).toBeInTheDocument();
  // Toggle the funnel: the empty LinkedIn row hides, Website stays.
  fireEvent.click(screen.getByRole("button", { name: /hide empty fields/i }));
  expect(screen.getByText("Website")).toBeInTheDocument();
  expect(screen.queryByText("LinkedIn")).not.toBeInTheDocument();
});

it("renders the section heading at the 16px token", () => {
  render(<CollapsibleSection title="Summary">x</CollapsibleSection>);
  expect(screen.getByText("Summary").closest("button")?.className).toContain("text-base");
});

it("left-aligns the section heading, matching Pipedrive (verified vs PD person/org sidebars)", () => {
  // PD person/org sidebar section headings are left-aligned (text-align:start, justify:space-between
  // with the action icons on the right), NOT centered. An earlier spec (C2) claimed centered; direct
  // PD comparison disproved it, so headings stay left in both the deal and contact sidebars.
  render(<CollapsibleSection title="Summary">x</CollapsibleSection>);
  expect(screen.getByText("Summary").closest("button")?.className).not.toContain("justify-center");
});
