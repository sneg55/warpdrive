// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IDENTITY_ERROR_MESSAGES } from "@/constants/settingsIdentity";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  // ResizeObserver (needed by form-nested Radix Checkbox) is polyfilled globally in vitest.setup.ts.
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

type CreateResult = { ok: true; value: { id: string } } | { ok: false; error: string };
type MembersResult = { ok: true; value: true } | { ok: false; error: string };
const { createTeamAction, setTeamMembersAction } = vi.hoisted(() => ({
  createTeamAction: vi.fn(
    (): Promise<CreateResult> => Promise.resolve({ ok: true, value: { id: "team-new" } }),
  ),
  setTeamMembersAction: vi.fn(
    (): Promise<MembersResult> => Promise.resolve({ ok: true, value: true }),
  ),
}));
vi.mock("@/features/identity/actions/teams", () => ({ createTeamAction, setTeamMembersAction }));

import { CreateTeamForm } from "./CreateTeamForm";

const ALICE = { id: "11111111-1111-1111-1111-111111111111", name: "Alice" };
const BOB = { id: "22222222-2222-2222-2222-222222222222", name: "Bob" };
const USERS = [ALICE, BOB];

function chooseSelect(label: string, option: string): void {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("CreateTeamForm", () => {
  it("submits the chosen manager id to createTeamAction", async () => {
    render(<CreateTeamForm users={USERS} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Sales" } });
    chooseSelect("Manager", ALICE.name);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(createTeamAction).toHaveBeenCalledWith("csrf", {
        name: "Sales",
        managerId: ALICE.id,
      }),
    );
  });

  it("calls setTeamMembersAction with the selected member ids after creation", async () => {
    render(<CreateTeamForm users={USERS} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Sales" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(setTeamMembersAction).toHaveBeenCalledWith("csrf", {
        teamId: "team-new",
        userIds: [BOB.id],
      }),
    );
  });

  it("passes managerId null when no manager is chosen", async () => {
    render(<CreateTeamForm users={USERS} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Ops" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(createTeamAction).toHaveBeenCalledWith("csrf", { name: "Ops", managerId: null }),
    );
    expect(setTeamMembersAction).not.toHaveBeenCalled();
  });

  it("only offers the users it is passed as manager/member options (no deactivated users)", () => {
    // page.tsx passes the isActive-filtered assignable list here, so a deactivated user (Bob,
    // omitted below) must never surface as a selectable manager or member. This locks the picker
    // contract: CreateTeamForm renders exactly the users it receives and pulls no wider list.
    render(<CreateTeamForm users={[ALICE]} onCreated={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: ALICE.name })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: BOB.name })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Manager"));
    expect(screen.getByRole("option", { name: ALICE.name })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: BOB.name })).not.toBeInTheDocument();
  });

  it("toggles a member by clicking their name, not only the checkbox", async () => {
    // The member name must be a real label tied to the checkbox, so clicking the name (a much
    // larger hit target than the 16px box) selects that member. Regression guard for the name
    // shipping as an inert <span>.
    render(<CreateTeamForm users={USERS} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Sales" } });
    fireEvent.click(screen.getByText(BOB.name, { selector: "label" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(setTeamMembersAction).toHaveBeenCalledWith("csrf", {
        teamId: "team-new",
        userIds: [BOB.id],
      }),
    );
  });

  it("shows an inline error when creation fails", async () => {
    createTeamAction.mockResolvedValueOnce({ ok: false as const, error: "unauthorized" });
    render(<CreateTeamForm users={USERS} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Sales" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(IDENTITY_ERROR_MESSAGES.permission);
  });
});
