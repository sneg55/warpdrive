// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IDENTITY_ERROR_MESSAGES } from "@/constants/settingsIdentity";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk observes its list's size to manage height; jsdom has no ResizeObserver.
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

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

type Result = { ok: true; value: true } | { ok: false; error: string };
const { addGroupMemberAction, removeGroupMemberAction } = vi.hoisted(() => ({
  addGroupMemberAction: vi.fn((): Promise<Result> => Promise.resolve({ ok: true, value: true })),
  removeGroupMemberAction: vi.fn((): Promise<Result> => Promise.resolve({ ok: true, value: true })),
}));
vi.mock("@/features/identity/actions/groups", () => ({
  addGroupMemberAction,
  removeGroupMemberAction,
}));

import { GroupMembersClient } from "./GroupMembersClient";

const ANN = { userId: "11111111-1111-1111-1111-111111111111", name: "Ann" };
const BOB = { id: "22222222-2222-2222-2222-222222222222", name: "Bob", avatarUrl: null };

describe("GroupMembersClient", () => {
  it("renders the current member roster", () => {
    render(<GroupMembersClient groupId="g1" members={[ANN]} allUsers={[BOB]} />);
    expect(screen.getByText("Ann")).toBeInTheDocument();
  });

  it("removes a member and refreshes the page", async () => {
    render(<GroupMembersClient groupId="g1" members={[ANN]} allUsers={[BOB]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    await waitFor(() =>
      expect(removeGroupMemberAction).toHaveBeenCalledWith("csrf", {
        groupId: "g1",
        userId: ANN.userId,
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("adds the picked user and refreshes the page", async () => {
    render(<GroupMembersClient groupId="g1" members={[ANN]} allUsers={[BOB]} />);
    fireEvent.click(screen.getByLabelText("Add member"));
    // The picker option's accessible name doubles up the avatar's aria-label with the
    // visible text (both say "Bob"), so match by role + visible text instead of name.
    fireEvent.click(screen.getAllByRole("option").find((o) => o.textContent?.includes("Bob"))!);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(addGroupMemberAction).toHaveBeenCalledWith("csrf", {
        groupId: "g1",
        userId: BOB.id,
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("only offers non-member users in the picker", () => {
    render(
      <GroupMembersClient
        groupId="g1"
        members={[ANN]}
        allUsers={[{ ...BOB, id: ANN.userId, name: "Ann" }, BOB]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Add member"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Bob");
  });

  it("shows an inline error when the remove action fails", async () => {
    removeGroupMemberAction.mockResolvedValueOnce({ ok: false, error: "unauthorized" });
    render(<GroupMembersClient groupId="g1" members={[ANN]} allUsers={[BOB]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(IDENTITY_ERROR_MESSAGES.permission);
  });
});
