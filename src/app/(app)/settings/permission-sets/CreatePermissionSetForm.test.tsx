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

const { createPermissionSetAction } = vi.hoisted(() => ({
  createPermissionSetAction: vi.fn(() =>
    Promise.resolve({ ok: false as const, error: "unauthorized" }),
  ),
}));
vi.mock("@/features/identity/actions/permission-sets", () => ({
  createPermissionSetAction,
  updateFlagsAction: vi.fn(() => Promise.resolve({ ok: true as const, value: true as const })),
}));

import { CreatePermissionSetForm } from "./CreatePermissionSetForm";

describe("CreatePermissionSetForm", () => {
  it("renders an inline error when the create action fails", async () => {
    render(<CreatePermissionSetForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Permission set name"), { target: { value: "Sales" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(createPermissionSetAction).toHaveBeenCalledWith("csrf", { name: "Sales" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(IDENTITY_ERROR_MESSAGES.permission);
  });
});
