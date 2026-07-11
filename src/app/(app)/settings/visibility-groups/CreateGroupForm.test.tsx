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

type ResultLike = { ok: true; value: { id: string } } | { ok: false; error: string };
const { createGroupAction } = vi.hoisted(() => ({
  createGroupAction: vi.fn(
    (): Promise<ResultLike> => Promise.resolve({ ok: false, error: "unauthorized" }),
  ),
}));
vi.mock("@/features/identity/actions/groups", () => ({ createGroupAction }));

import { CreateGroupForm } from "./CreateGroupForm";

describe("CreateGroupForm", () => {
  it("renders an inline error when the create action fails", async () => {
    render(<CreateGroupForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Visibility group name"), {
      target: { value: "Sales" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createGroupAction).toHaveBeenCalledWith("csrf", { name: "Sales" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(IDENTITY_ERROR_MESSAGES.permission);
  });

  it("clears the error on the next submit attempt", async () => {
    createGroupAction.mockResolvedValueOnce({ ok: false as const, error: "unauthorized" });
    createGroupAction.mockResolvedValueOnce({ ok: true as const, value: { id: "g1" } });
    const onCreated = vi.fn();
    render(<CreateGroupForm onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Visibility group name"), {
      target: { value: "Sales" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Visibility group name"), { target: { value: "Ops" } });
    // The alert can render one commit before the transition finishes and isPending flips back, so
    // the button may still read "Creating..." at this point. findByRole retries until it returns to
    // "Create" (isPending === false); a synchronous getByRole here was the flake (button not found).
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
