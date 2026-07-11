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
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const items = [
  { label: "First name", value: "{{person.first_name}}" },
  { label: "Deal title", value: "{{deal.title}}" },
];

it("opens the menu and lists every field", async () => {
  const user = userEvent.setup();
  render(<InsertFieldMenu items={items} onInsert={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /insert field/i }));
  expect(screen.getByRole("menuitem", { name: "First name" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Deal title" })).toBeInTheDocument();
});

it("calls onInsert with the picked field's value", async () => {
  const onInsert = vi.fn();
  const user = userEvent.setup();
  render(<InsertFieldMenu items={items} onInsert={onInsert} />);
  await user.click(screen.getByRole("button", { name: /insert field/i }));
  await user.click(screen.getByRole("menuitem", { name: "Deal title" }));
  expect(onInsert).toHaveBeenCalledWith("{{deal.title}}");
});

it("renders nothing when there are no items (menu would be empty)", () => {
  render(<InsertFieldMenu items={[]} onInsert={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /insert field/i })).toBeNull();
});
