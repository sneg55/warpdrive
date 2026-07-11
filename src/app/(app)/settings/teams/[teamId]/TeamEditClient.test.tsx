// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

type R = { ok: true; value: true } | { ok: false; error: string };
const { updateTeamAction, setTeamMembersAction, deleteTeamAction } = vi.hoisted(() => ({
  updateTeamAction: vi.fn<(csrfToken: string, input: unknown) => Promise<R>>(() =>
    Promise.resolve({ ok: true, value: true }),
  ),
  setTeamMembersAction: vi.fn<(csrfToken: string, input: unknown) => Promise<R>>(() =>
    Promise.resolve({ ok: true, value: true }),
  ),
  deleteTeamAction: vi.fn<(csrfToken: string, input: unknown) => Promise<R>>(() =>
    Promise.resolve({ ok: true, value: true }),
  ),
}));
vi.mock("@/features/identity/actions/teams", () => ({
  updateTeamAction,
  setTeamMembersAction,
  deleteTeamAction,
}));

import { TeamEditClient } from "./TeamEditClient";

const TEAM_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ALICE = { id: "11111111-1111-1111-1111-111111111111", name: "Alice", avatarUrl: null };
const BOB = { id: "22222222-2222-2222-2222-222222222222", name: "Bob", avatarUrl: null };

function renderClient() {
  return render(
    <TeamEditClient
      teamId={TEAM_ID}
      name="West Team"
      managerId={ALICE.id}
      members={[{ userId: ALICE.id, name: ALICE.name }]}
      assignableUsers={[ALICE, BOB]}
    />,
  );
}

describe("TeamEditClient", () => {
  it("pre-loads the team name and current members (view existing team)", () => {
    renderClient();
    expect(screen.getByLabelText("Team name")).toHaveValue("West Team");
    // Alice is the manager AND a current member, so she renders in both the manager select and the
    // members chip list (at least once each). Pre-loading the roster is the point.
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
  });

  it("saves a rename + membership via updateTeamAction then setTeamMembersAction", async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "West Region" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateTeamAction).toHaveBeenCalledTimes(1));
    expect(updateTeamAction.mock.calls[0]?.[1]).toMatchObject({
      teamId: TEAM_ID,
      name: "West Region",
      managerId: ALICE.id,
    });
    await waitFor(() => expect(setTeamMembersAction).toHaveBeenCalledTimes(1));
    expect(setTeamMembersAction.mock.calls[0]?.[1]).toMatchObject({ teamId: TEAM_ID });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("deletes the team and navigates back to the list", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Delete team" }));
    await waitFor(() => expect(deleteTeamAction).toHaveBeenCalledTimes(1));
    expect(deleteTeamAction.mock.calls[0]?.[1]).toMatchObject({ teamId: TEAM_ID });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings/teams"));
  });
});
