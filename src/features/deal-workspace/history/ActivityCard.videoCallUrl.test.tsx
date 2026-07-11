// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { ActivityCard } from "./ActivityCard";

vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ activities: { listForEntity: { setData: vi.fn(), invalidate: vi.fn() } } }),
  },
}));
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => vi.fn(),
}));

afterEach(cleanup);

const AT = new Date("2026-07-02T10:00:00Z");
function makeActivity(over: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Discovery call",
    dueAt: AT,
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: "Nick",
    ...over,
  };
}

it("renders a video call link when the activity has a videoCallUrl", () => {
  const url = "https://meet.example.com/abc-defg-hij";
  render(<ActivityCard activity={makeActivity({ videoCallUrl: url })} at={AT} />);
  const link = screen.getByRole("link", { name: /video call/i });
  expect(link).toHaveAttribute("href", url);
});

it("omits the video call link when there is no videoCallUrl", () => {
  render(<ActivityCard activity={makeActivity({ videoCallUrl: null })} at={AT} />);
  expect(screen.queryByRole("link", { name: /video call/i })).not.toBeInTheDocument();
});
