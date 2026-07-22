// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    identity: { assignableUsers: { useQuery: () => ({ data: [], isLoading: false }) } },
    contacts: {
      personOptions: {
        useQuery: () => ({ data: [{ id: "person-1", name: "Jane Roe" }], isLoading: false }),
      },
      orgOptions: { useQuery: () => ({ data: [], isLoading: false }) },
    },
  },
}));

import { CustomFieldDetail, CustomFieldFormControl } from "./render.widgets";

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

describe("CustomFieldFormControl references", () => {
  it("uses a searchable entity picker and emits the selected id", () => {
    const onChange = vi.fn();
    const def: CustomFieldDef = {
      ...monetary,
      id: "cf-person",
      type: "person",
      name: "Sponsor",
      key: "sponsor",
    };
    render(<CustomFieldFormControl def={def} value="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Sponsor"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("option", { name: "Jane Roe" }));
    expect(onChange).toHaveBeenCalledWith("person-1");
  });
});
