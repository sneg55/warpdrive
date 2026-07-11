// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Radix Popover + cmdk need these jsdom polyfills (mirrors Combobox.test.tsx).
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

// The search query returns grouped arrays (deals/people/organizations/leads), each item
// { id, primary, secondary }. There is no per-item kind discriminator; the group IS the kind.
const searchData = {
  deals: [{ id: "d1", primary: "Big Deal", secondary: "$1000" }],
  people: [{ id: "p1", primary: "Jane Doe", secondary: "jane@acme.com" }],
  organizations: [{ id: "o1", primary: "Acme Inc", secondary: null }],
  leads: [],
};
vi.mock("@/lib/trpc-client", () => ({
  trpc: { search: { query: { useQuery: () => ({ data: searchData }) } } },
}));

import { LinkExistingCombobox } from "./LinkExistingCombobox";

afterEach(cleanup);

describe("LinkExistingCombobox", () => {
  it("shows only person results and emits the picked person id", async () => {
    const onPick = vi.fn();
    render(<LinkExistingCombobox kind="person" triggerLabel="Link to existing" onPick={onPick} />);

    fireEvent.click(screen.getByRole("button", { name: "Link to existing" }));
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "Ja" } });

    // Person row appears; the deal and org rows are filtered out (kind="person" reads only people).
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Big Deal")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Inc")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Jane Doe"));
    expect(onPick).toHaveBeenCalledWith("p1");
  });

  it("shows only deal results and emits the picked deal id", async () => {
    const onPick = vi.fn();
    render(<LinkExistingCombobox kind="deal" triggerLabel="Link to existing" onPick={onPick} />);

    fireEvent.click(screen.getByRole("button", { name: "Link to existing" }));
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "Bi" } });

    expect(await screen.findByText("Big Deal")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Big Deal"));
    expect(onPick).toHaveBeenCalledWith("d1");
  });
});
