// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { CustomFieldDetail } from "./render.widgets";

afterEach(cleanup);

const monetary: CustomFieldDef = {
  id: "cf1",
  targetEntity: "deal",
  type: "monetary",
  name: "Budget",
  key: "budget",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: false,
  order: 0,
  archivedAt: null,
};

describe("CustomFieldDetail monetary currency", () => {
  it("formats a monetary value in the passed base currency, not always USD", () => {
    render(<CustomFieldDetail def={monetary} value={1000} currency="EUR" />);
    const text = screen.getByText(/1,000/).textContent ?? "";
    expect(text).toContain("€");
    expect(text).not.toContain("$");
  });
});
