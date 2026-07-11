// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FieldRow } from "./FieldRow";
import { HideEmptyContext } from "./sectionFilter";

afterEach(cleanup);

it("renders a small medium label and a left-aligned value", () => {
  render(<FieldRow label="Value">$10,000</FieldRow>);
  const label = screen.getByText("Value");
  expect(label.className).toContain("text-xs");
  expect(label.className).toContain("font-medium");
  expect(label.className).toContain("text-right");
  expect(label.className).toContain("text-muted-foreground");
  const value = screen.getByTestId("field-row-value");
  expect(value).toHaveTextContent("$10,000");
  expect(value.className).toContain("text-left");
});

it("stays visible when empty but the section is not hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={false}>
      <FieldRow label="LinkedIn" empty>
        -
      </FieldRow>
    </HideEmptyContext.Provider>,
  );
  expect(screen.getByText("LinkedIn")).toBeInTheDocument();
});

it("self-hides when empty and the section is hiding empties", () => {
  render(
    <HideEmptyContext.Provider value={true}>
      <FieldRow label="LinkedIn" empty>
        -
      </FieldRow>
    </HideEmptyContext.Provider>,
  );
  expect(screen.queryByText("LinkedIn")).not.toBeInTheDocument();
});

it("renders a leading icon when provided", () => {
  render(
    <FieldRow label="Value" icon={<svg data-testid="lead-icon" />}>
      $1
    </FieldRow>,
  );
  expect(screen.getByTestId("lead-icon")).toBeInTheDocument();
});

it("wraps a long unbreakable value instead of overflowing into the label column", () => {
  const longUrl = "https://www.linkedin.com/company/a-very-long-company-slug-that-does-not-wrap";
  render(<FieldRow label="LinkedIn">{longUrl}</FieldRow>);
  const value = screen.getByText(longUrl);
  expect(value.className).toContain("break-words");
  expect(value.className).toContain("min-w-0");
});
