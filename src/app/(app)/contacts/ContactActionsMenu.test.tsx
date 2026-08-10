// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));
const deletePersonAction = vi.fn(() => Promise.resolve({ ok: true, value: { id: "pe1" } }));
vi.mock("@/features/contacts/actions", () => ({
  deletePersonAction: (...a: unknown[]) => deletePersonAction(...(a as [])),
  deleteOrgAction: vi.fn(),
}));

import { ContactActionsMenu } from "./ContactActionsMenu";

it("hides Merge and Delete when the actor lacks the capability", async () => {
  const user = userEvent.setup();
  render(
    <ContactActionsMenu
      entityType="person"
      entityId="pe1"
      canMerge={false}
      canDelete={false}
      onMerge={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Contact actions" }));
  expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /merge/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument();
});

function renderMenu(onMerge = vi.fn()): void {
  render(
    <ContactActionsMenu
      entityType="person"
      entityId="pe1"
      canMerge={true}
      canDelete={true}
      onMerge={onMerge}
    />,
  );
}

// Opens the menu and picks "Delete", returning the confirmation surface it raises.
async function openDeleteConfirm(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: "Contact actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  return await screen.findByRole("alertdialog");
}

it("invokes onMerge when permitted", async () => {
  const onMerge = vi.fn();
  const user = userEvent.setup();
  renderMenu(onMerge);
  await user.click(screen.getByRole("button", { name: "Contact actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Merge duplicates" }));
  expect(onMerge).toHaveBeenCalled();
});

// The destructive confirm is the shadcn AlertDialog, never the browser's window.confirm chrome.
it("Delete raises an in-app confirm dialog, not a native browser confirm", async () => {
  const nativeConfirm = vi.spyOn(window, "confirm");
  const user = userEvent.setup();
  renderMenu();
  const dialog = await openDeleteConfirm(user);
  expect(within(dialog).getByText("Delete this record?")).toBeInTheDocument();
  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(deletePersonAction).not.toHaveBeenCalled();
});

it("confirming the dialog deletes and routes back to the list", async () => {
  const user = userEvent.setup();
  renderMenu();
  const dialog = await openDeleteConfirm(user);
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(deletePersonAction).toHaveBeenCalledWith({ id: "pe1" }, "tok"));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/people"));
});

it("cancelling the dialog closes it without deleting", async () => {
  const user = userEvent.setup();
  renderMenu();
  const dialog = await openDeleteConfirm(user);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(deletePersonAction).not.toHaveBeenCalled();
});
