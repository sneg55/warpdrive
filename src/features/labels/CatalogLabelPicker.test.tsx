// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // Radix DropdownMenu reaches for these browser APIs jsdom does not implement.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

const catalog = [
  { id: "l1", target: "person", name: "Champion", color: "green", order: 0 },
  { id: "l2", target: "person", name: "Hot", color: "red", order: 1 },
];
let queryData: unknown = catalog;
vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: queryData }) } } },
}));

import { CatalogLabelPicker } from "./CatalogLabelPicker";

async function openMenu(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /add labels/i }));
}

describe("CatalogLabelPicker", () => {
  it("opens a dropdown list of every catalog label plus a create-label item", async () => {
    render(<CatalogLabelPicker target="person" value={[]} onChange={() => {}} />);
    await openMenu();
    expect(screen.getByRole("menuitemcheckbox", { name: /Champion/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: /Hot/ })).toBeInTheDocument();
    const create = screen.getByRole("menuitem", { name: /create new label/i });
    expect(create).toHaveAttribute("href", "/settings/company/labels");
  });

  it("adds a label name when an unchecked item is selected", async () => {
    const onChange = vi.fn();
    render(<CatalogLabelPicker target="person" value={[]} onChange={onChange} />);
    await openMenu();
    await userEvent.setup().click(screen.getByRole("menuitemcheckbox", { name: /Champion/ }));
    expect(onChange).toHaveBeenCalledWith(["Champion"]);
  });

  it("marks an applied label checked (case-insensitively) and removes it when toggled off", async () => {
    const onChange = vi.fn();
    // Stored as a legacy lowercase key; it must still register as the active "Hot" item.
    render(<CatalogLabelPicker target="person" value={["hot"]} onChange={onChange} />);
    await openMenu();
    const hot = screen.getByRole("menuitemcheckbox", { name: /Hot/ });
    expect(hot).toHaveAttribute("aria-checked", "true");
    await userEvent.setup().click(hot);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows an empty hint but still offers the create item when the catalog is empty", async () => {
    queryData = [];
    render(<CatalogLabelPicker target="deal" value={[]} onChange={() => {}} />);
    await openMenu();
    expect(screen.getByText(/no labels yet/i)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /create new label/i })).toBeInTheDocument();
    queryData = catalog;
  });
});
