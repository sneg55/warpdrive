// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LeadRowActions } from "./LeadRowActions";

afterEach(cleanup);

const baseProps = {
  archived: false,
  converted: false,
  busy: false,
  onOpen: vi.fn(),
  onConvert: vi.fn(),
  onArchiveToggle: vi.fn(),
  onDelete: vi.fn(),
  assignableUsers: [{ id: "u1", name: "Ada" }],
  onChangeOwner: vi.fn(),
};

it("does not bubble menu open/select to the parent row's onClick", async () => {
  const user = userEvent.setup();
  const rowClick = vi.fn();
  const onDelete = vi.fn();
  render(
    // biome-ignore lint/a11y/noStaticElementInteractions: test stand-in for the LeadsTable <tr> row handler
    // biome-ignore lint/a11y/useKeyWithClickEvents: test stand-in for the LeadsTable <tr> row handler
    <div onClick={rowClick}>
      <LeadRowActions {...baseProps} onDelete={onDelete} />
    </div>,
  );

  await user.click(screen.getByRole("button", { name: "Lead actions" }));
  expect(rowClick).not.toHaveBeenCalled();

  await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(rowClick).not.toHaveBeenCalled();
});

it("hides the Change owner submenu when there are no assignable users", async () => {
  const user = userEvent.setup();
  render(<LeadRowActions {...baseProps} assignableUsers={[]} />);
  await user.click(screen.getByRole("button", { name: "Lead actions" }));
  expect(screen.queryByText("Change owner")).toBeNull();
  expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
});
