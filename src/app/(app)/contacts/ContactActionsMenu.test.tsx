// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

it("invokes onMerge and deletes (after confirm) when permitted", async () => {
  const onMerge = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(
    <ContactActionsMenu
      entityType="person"
      entityId="pe1"
      canMerge={true}
      canDelete={true}
      onMerge={onMerge}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Contact actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Merge duplicates" }));
  expect(onMerge).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Contact actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  await vi.waitFor(() => expect(deletePersonAction).toHaveBeenCalledWith({ id: "pe1" }, "tok"));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/contacts/people"));
});
