// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/constants/strings";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const report = vi.hoisted(() => vi.fn());
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => report }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const { updateProfilePreferencesAction } = vi.hoisted(() => ({
  updateProfilePreferencesAction: vi.fn(
    (): Promise<{ ok: true } | { ok: false; error: { id: string } }> =>
      Promise.resolve({ ok: true }),
  ),
}));
vi.mock("@/features/identity/preferencesActions", () => ({
  updateProfilePreferencesAction,
}));

type UpdateProfileResult = { ok: true } | { ok: false; error: { id: string } };
const { updateUserProfileAction } = vi.hoisted(() => ({
  updateUserProfileAction: vi.fn((): Promise<UpdateProfileResult> => Promise.resolve({ ok: true })),
}));
vi.mock("@/features/identity/profileActions", () => ({ updateUserProfileAction }));

// Avatar upload has its own suite; stub it here so these tests don't pull the server-only
// avatar actions (db/minio) into the client render.
vi.mock("@/features/identity/avatar/AvatarUpload", () => ({
  AvatarUpload: () => null,
}));

import { ProfileClient } from "./ProfileClient";

const TIMEZONE_CHOICE = "America/New_York";

describe("ProfileClient", () => {
  it("timezone is a branded Select that emits the picked value", () => {
    render(
      <ProfileClient
        name="Jane"
        email="jane@example.com"
        avatarUrl={null}
        timezone="UTC"
        density="comfortable"
      />,
    );

    const trigger = screen.getByLabelText(STRINGS.settings.timezone);
    expect(trigger.tagName).toBe("BUTTON");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByText(TIMEZONE_CHOICE));

    expect(trigger).toHaveTextContent(TIMEZONE_CHOICE);
  });

  it("saves an edited display name via updateUserProfileAction", async () => {
    render(
      <ProfileClient
        name="Jane"
        email="jane@example.com"
        avatarUrl={null}
        timezone="UTC"
        density="comfortable"
      />,
    );

    const nameInput = screen.getByLabelText(STRINGS.settings.name);
    fireEvent.change(nameInput, { target: { value: "Real Name" } });
    fireEvent.click(screen.getByRole("button", { name: STRINGS.settings.saveName }));

    await vi.waitFor(() =>
      expect(updateUserProfileAction).toHaveBeenCalledWith({ name: "Real Name" }, "csrf"),
    );
  });

  it("shows an error id when the name save fails", async () => {
    updateUserProfileAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_USER_002" },
    });
    render(
      <ProfileClient
        name="Jane"
        email="jane@example.com"
        avatarUrl={null}
        timezone="UTC"
        density="comfortable"
      />,
    );

    fireEvent.change(screen.getByLabelText(STRINGS.settings.name), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: STRINGS.settings.saveName }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("E_USER_002"));
  });

  it("reports the error id when the preferences save is denied", async () => {
    updateProfilePreferencesAction.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_PERM_001" },
    });
    render(
      <ProfileClient
        name="Jane"
        email="jane@example.com"
        avatarUrl={null}
        timezone="UTC"
        density="comfortable"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: STRINGS.settings.save }));

    await vi.waitFor(() => expect(report).toHaveBeenCalledWith("E_PERM_001"));
  });
});
