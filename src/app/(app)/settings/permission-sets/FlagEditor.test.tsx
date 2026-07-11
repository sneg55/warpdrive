// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IDENTITY_ERROR_MESSAGES } from "@/constants/settingsIdentity";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

type ResultLike = { ok: true; value: true } | { ok: false; error: string };
const { updateFlagsAction } = vi.hoisted(() => ({
  updateFlagsAction: vi.fn((): Promise<ResultLike> => Promise.resolve({ ok: true, value: true })),
}));
vi.mock("@/features/identity/actions/permission-sets", () => ({
  createPermissionSetAction: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: { id: "x" } }),
  ),
  updateFlagsAction,
}));

import { FlagEditor } from "./FlagEditor";

const SET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("FlagEditor", () => {
  it("prefills checkboxes from the set's current flags", () => {
    render(
      <FlagEditor
        setId={SET_ID}
        name="Sales"
        flags={{ "deal.create": true, "deal.edit_own": true }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "deal.create" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "deal.edit_own" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "contact.create" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "deal.edit_any" })).not.toBeChecked();
  });

  it("submits the updated flags map via updateFlagsAction", async () => {
    render(
      <FlagEditor setId={SET_ID} name="Sales" flags={{ "deal.create": true }} onSaved={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "contact.create" }));
    fireEvent.click(screen.getByRole("button", { name: "Save flags" }));
    await waitFor(() => expect(updateFlagsAction).toHaveBeenCalledTimes(1));
    expect(updateFlagsAction).toHaveBeenCalledWith(
      "csrf",
      expect.objectContaining({
        setId: SET_ID,
        flags: expect.objectContaining({
          "deal.create": true,
          "contact.create": true,
          "deal.edit_any": false,
        }),
      }),
    );
  });

  it("shows an inline error when the update fails", async () => {
    updateFlagsAction.mockResolvedValueOnce({ ok: false as const, error: "unauthorized" });
    render(<FlagEditor setId={SET_ID} name="Sales" flags={{}} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save flags" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(IDENTITY_ERROR_MESSAGES.permission);
  });
});
