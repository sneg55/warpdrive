// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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

it("saves a changed title via the shared inline-edit footer", () => {
  render(<EditableTitle {...props} />);
  expect(screen.getByRole("heading", { name: "Acme" })).toHaveClass("text-[25px]");
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  const input = screen.getByRole("textbox", { name: "Edit deal title" });
  fireEvent.change(input, { target: { value: "Acme Corp" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(updateDealAction).toHaveBeenCalledWith(
    { dealId: "d1", expectedUpdatedAt: props.expectedUpdatedAt, title: "Acme Corp" },
    "csrf",
  );
});

it("does not call the action for an unchanged or empty title", () => {
  render(<EditableTitle {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  const input2 = screen.getByRole("textbox", { name: "Edit deal title" });
  fireEvent.change(input2, { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(updateDealAction).not.toHaveBeenCalled();
});

it("reverts through the shared Cancel action without calling the mutation", () => {
  render(<EditableTitle {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit deal title" }));
  const input = screen.getByRole("textbox", { name: "Edit deal title" });
  fireEvent.change(input, { target: { value: "Changed" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(updateDealAction).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Acme" })).toBeInTheDocument();
});
