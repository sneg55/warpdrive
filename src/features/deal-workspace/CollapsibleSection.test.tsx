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
  expect(screen.getByText("Website")).toBeInTheDocument();
  expect(screen.getByText("LinkedIn")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /hide empty fields/i }));
  expect(screen.getByText("Website")).toBeInTheDocument();
  expect(screen.queryByText("LinkedIn")).not.toBeInTheDocument();
});

it("renders the section heading at the 16px token", () => {
  render(<CollapsibleSection title="Summary">x</CollapsibleSection>);
  expect(screen.getByText("Summary").closest("button")?.className).toContain("text-base");
});

it("left-aligns the section heading, matching Pipedrive (verified vs PD person/org sidebars)", () => {
  render(<CollapsibleSection title="Summary">x</CollapsibleSection>);
  expect(screen.getByText("Summary").closest("button")?.className).not.toContain("justify-center");
});
