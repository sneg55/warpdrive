// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomFieldRefLabelsProvider } from "@/features/custom-fields/refLabelsContext";
import type { CustomFieldDef } from "@/types/customFields";
import { CustomFieldCell, customFieldCellClass } from "./CustomFieldCell";

afterEach(cleanup);

function def(over: Partial<CustomFieldDef>): CustomFieldDef {
  return {
    id: "d",
    targetEntity: "deal",
    type: "text",
    name: "F",
    key: "f",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
    ...over,
  };
}

describe("CustomFieldCell", () => {
  it("renders nothing for an empty value", () => {
    const { container } = render(<CustomFieldCell def={def({})} value="" currency="USD" />);
    expect(container.textContent).toBe("");
  });
  it("wraps the truncated value in a Tip instead of a native title", () => {
    render(<CustomFieldCell def={def({ type: "monetary" })} value={1200} currency="EUR" />);
    const span = screen.getByText(/1[.,]200/);
    expect(span.getAttribute("title")).toBeNull();
    expect(span.className).toContain("truncate");
  });
  it("resolves a reference through the provider", () => {
    render(
      <CustomFieldRefLabelsProvider value={{ user: { u1: "Ada" }, person: {}, org: {} }}>
        <CustomFieldCell def={def({ type: "user" })} value="u1" currency="USD" />
      </CustomFieldRefLabelsProvider>,
    );
    expect(screen.getByText("Ada")).not.toBeNull();
  });
  it("right-aligns numeric cells", () => {
    expect(customFieldCellClass(def({ type: "numeric" }))).toContain("text-right");
    expect(customFieldCellClass(def({}))).not.toContain("text-right");
  });
});
