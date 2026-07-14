// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationType } from "@/constants/notificationTypes";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import { STRINGS } from "@/constants/strings";
import { PreferencesForm } from "./PreferencesForm";

afterEach(cleanup);

const { columnInApp, columnEmail } = STRINGS.notifications.preferences;

type Prefs = Record<NotificationType, { inApp: boolean; email: boolean }>;

const allFalse: Prefs = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t, { inApp: false, email: false }]),
) as Prefs;

const allTrue: Prefs = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t, { inApp: true, email: true }]),
) as Prefs;

describe("PreferencesForm", () => {
  it("renders a toggle row for every notification type", () => {
    render(<PreferencesForm prefs={allFalse} onChange={() => {}} />);
    expect(screen.getAllByTestId("pref-row")).toHaveLength(NOTIFICATION_TYPES.length);
  });

  it("renders an in-app and email switch per row, each with its accessible name", () => {
    render(<PreferencesForm prefs={allFalse} onChange={() => {}} />);
    expect(screen.getAllByRole("switch", { name: columnInApp })).toHaveLength(
      NOTIFICATION_TYPES.length,
    );
    expect(screen.getAllByRole("switch", { name: columnEmail })).toHaveLength(
      NOTIFICATION_TYPES.length,
    );
  });

  it("reflects the checked state through aria-checked", () => {
    render(<PreferencesForm prefs={allTrue} onChange={() => {}} />);
    expect(screen.getAllByRole("switch", { name: columnInApp })[0]!).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Unchecked row renders the same switch with aria-checked="false".
    cleanup();
    render(<PreferencesForm prefs={allFalse} onChange={() => {}} />);
    expect(screen.getAllByRole("switch", { name: columnInApp })[0]!).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("calls onChange with flipped inApp value when the in-app switch is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PreferencesForm prefs={allFalse} onChange={onChange} />);
    const inAppToggles = screen.getAllByRole("switch", { name: columnInApp });
    // getAllByRole throws if nothing found, so index 0 is always defined
    await user.click(inAppToggles[0]!);
    expect(onChange).toHaveBeenCalledWith("mention", { inApp: true, email: false });
  });

  it("toggles the switch when its visible label text is clicked (label association)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PreferencesForm prefs={allFalse} onChange={onChange} />);
    // Click the visible "In-app" label of the first row, not the switch control itself.
    const inAppLabels = screen.getAllByText(columnInApp);
    await user.click(inAppLabels[0]!);
    expect(onChange).toHaveBeenCalledWith("mention", { inApp: true, email: false });
  });

  it("calls onChange with flipped email value when the email switch is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PreferencesForm prefs={allTrue} onChange={onChange} />);
    const emailToggles = screen.getAllByRole("switch", { name: columnEmail });
    // getAllByRole throws if nothing found, so index 0 is always defined
    await user.click(emailToggles[0]!);
    expect(onChange).toHaveBeenCalledWith("mention", { inApp: true, email: false });
  });
});
