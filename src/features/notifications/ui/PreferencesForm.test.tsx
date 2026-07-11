// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationType } from "@/constants/notificationTypes";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import { PreferencesForm } from "./PreferencesForm";

afterEach(cleanup);

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

  it("calls onChange with flipped inApp value when the in-app toggle is clicked", () => {
    const onChange = vi.fn();
    render(<PreferencesForm prefs={allFalse} onChange={onChange} />);
    // Click the first in-app toggle (mention row)
    const inAppToggles = screen.getAllByRole("switch", { name: /in-app/i });
    // getAllByRole throws if nothing found, so index 0 is always defined
    fireEvent.click(inAppToggles[0]!);
    expect(onChange).toHaveBeenCalledWith("mention", { inApp: true, email: false });
  });

  it("calls onChange with flipped email value when the email toggle is clicked", () => {
    const onChange = vi.fn();
    render(<PreferencesForm prefs={allTrue} onChange={onChange} />);
    // Click the first email toggle (mention row)
    const emailToggles = screen.getAllByRole("switch", { name: /email/i });
    // getAllByRole throws if nothing found, so index 0 is always defined
    fireEvent.click(emailToggles[0]!);
    expect(onChange).toHaveBeenCalledWith("mention", { inApp: true, email: false });
  });
});
