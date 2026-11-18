// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";

afterEach(cleanup);

const prefs = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, { inApp: true, email: false }]));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ notifications: { preferences: { invalidate: vi.fn() } } }),
    notifications: { preferences: { useQuery: () => ({ data: prefs }) } },
  },
}));
vi.mock("@/features/notifications/actions", () => ({
  setPreferenceAction: vi.fn(() => Promise.resolve({ ok: true as const })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import NotificationSettingsPage from "./page";

describe("NotificationSettingsPage layout", () => {
  it("left-aligns the pane like the other settings pages (no centering wrapper)", () => {
    const { container } = render(<NotificationSettingsPage />);
    const pane = container.firstElementChild;
    expect(pane).not.toBeNull();
    expect(pane?.className).not.toContain("mx-auto");
  });
});
