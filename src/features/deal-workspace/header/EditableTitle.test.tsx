// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const updateDealAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "d1" } })),
);
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { EditableTitle } from "./EditableTitle";

afterEach(() => {
  cleanup();
  updateDealAction.mockClear();
});

const props = { dealId: "d1", title: "Acme", expectedUpdatedAt: "2026-07-02T00:00:00.000Z" };

it("saves a changed title via updateDealAction on blur", () => {
  render(<EditableTitle {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  const input = screen.getByRole("textbox", { name: "Edit deal title" });
  fireEvent.change(input, { target: { value: "Acme Corp" } });
  fireEvent.blur(input);
  expect(updateDealAction).toHaveBeenCalledWith(
    { dealId: "d1", expectedUpdatedAt: props.expectedUpdatedAt, title: "Acme Corp" },
    "csrf",
  );
});

it("does not call the action for an unchanged or empty title", () => {
  render(<EditableTitle {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  const input = screen.getByRole("textbox", { name: "Edit deal title" });
  fireEvent.blur(input); // unchanged
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  const input2 = screen.getByRole("textbox", { name: "Edit deal title" });
  fireEvent.change(input2, { target: { value: "   " } });
  fireEvent.blur(input2); // empty
  expect(updateDealAction).not.toHaveBeenCalled();
});

it("reverts on Escape without calling the action", () => {
  render(<EditableTitle {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  const input = screen.getByRole("textbox", { name: "Edit deal title" });
  fireEvent.change(input, { target: { value: "Changed" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(updateDealAction).not.toHaveBeenCalled();
});
