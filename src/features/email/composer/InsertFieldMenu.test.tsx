// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { InsertFieldMenu } from "./InsertFieldMenu";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk observes its list size; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const items = [
  { label: "First name", value: "{{person.first_name}}", category: "Person" },
  { label: "Deal title", value: "{{deal.title}}", category: "Deal" },
];

it("opens the menu and lists every field", async () => {
  const user = userEvent.setup();
  render(<InsertFieldMenu items={items} onInsert={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /insert field/i }));
  expect(screen.getByRole("option", { name: "First name" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Deal title" })).toBeInTheDocument();
});

it("calls onInsert with the picked field's value", async () => {
  const onInsert = vi.fn();
  const user = userEvent.setup();
  render(<InsertFieldMenu items={items} onInsert={onInsert} />);
  await user.click(screen.getByRole("button", { name: /insert field/i }));
  await user.click(screen.getByRole("option", { name: "Deal title" }));
  expect(onInsert).toHaveBeenCalledWith("{{deal.title}}");
});

it("renders nothing when there are no items (menu would be empty)", () => {
  render(<InsertFieldMenu items={[]} onInsert={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /insert field/i })).toBeNull();
});

it("filters by entity-category tab (PD parity)", async () => {
  const user = userEvent.setup();
  render(<InsertFieldMenu items={items} onInsert={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /insert field/i }));
  await user.click(screen.getByRole("tab", { name: "Deal" }));
  expect(screen.getByRole("option", { name: "Deal title" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "First name" })).toBeNull();
});

it("shows an Update autofilled values action when onRefresh is provided", async () => {
  const onRefresh = vi.fn();
  const user = userEvent.setup();
  render(<InsertFieldMenu items={items} onInsert={vi.fn()} onRefresh={onRefresh} />);
  await user.click(screen.getByRole("button", { name: /insert field/i }));
  await user.click(screen.getByRole("button", { name: /update autofilled values/i }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

it("filters the field list by the search box (PD parity)", async () => {
  const user = userEvent.setup();
  render(<InsertFieldMenu items={items} onInsert={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /insert field/i }));
  await user.type(screen.getByPlaceholderText(/search/i), "deal");
  // Only the matching field survives the type-ahead.
  expect(screen.getByRole("option", { name: "Deal title" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "First name" })).toBeNull();
});
