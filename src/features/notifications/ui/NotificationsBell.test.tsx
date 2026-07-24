// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// Router/stream/actions/trpc are mocked at the module boundary (mirrors DealSidebar.test.tsx)
// so the dropdown renders purely off an empty feed without a QueryClientProvider or real DB.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./useNotificationStream", () => ({ useNotificationStream: () => undefined }));
const markAllReadAction = vi.fn(() => Promise.resolve({ ok: true, value: {} }));
vi.mock("@/features/notifications/actions", () => ({
  markReadAction: vi.fn(),
  markAllReadAction: (...a: unknown[]) => markAllReadAction(...(a as [])),
}));
const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      notifications: {
        feed: { invalidate: vi.fn() },
        unreadCount: { invalidate: vi.fn() },
      },
    }),
    notifications: {
      unreadCount: { useQuery: () => ({ data: 3 }) },
      feed: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import { NotificationsBell } from "./NotificationsBell";

afterEach(() => {
  cleanup();
  reportError.mockClear();
  markAllReadAction.mockClear();
});

describe("NotificationsBell", () => {
  it("renders a crisp lucide bell icon, not an emoji glyph", () => {
    const { container } = render(<NotificationsBell userId="u1" />);
    // No emoji glyphs: the system-font bell (blurry) or the old lightbulb.
    expect(container.textContent).not.toContain("\u{1F514}");
    expect(container.textContent).not.toContain("\u{1F4A1}");
    // A vector bell icon is rendered instead.
    expect(container.querySelector("svg.lucide-bell")).not.toBeNull();
  });

  it("reports the error id when Mark all read is denied (no silent no-op)", async () => {
    markAllReadAction.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } } as never);
    const user = userEvent.setup();
    render(<NotificationsBell userId="u1" />);
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await user.click(await screen.findByRole("button", { name: /mark all/i }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  });
});
