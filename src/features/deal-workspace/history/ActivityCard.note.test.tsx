// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
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
    allDay: false,
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

it("renders location text and a note preview when present", () => {
  render(
    <ActivityCard
      activity={makeActivity({ location: "HQ", note: "<p>ring the bell</p>" })}
      at={AT}
    />,
  );
  expect(screen.getByText("HQ")).toBeInTheDocument();
  expect(screen.getByText("ring the bell")).toBeInTheDocument();
});

it("renders the activity note as a highlighted band (Pipedrive), not plain muted text", () => {
  render(<ActivityCard activity={makeActivity({ note: "<p>ring the bell</p>" })} at={AT} />);
  const band = screen.getByTestId("activity-note");
  expect(band).toHaveTextContent("ring the bell");
  expect(band.className).toMatch(/bg-warning/);
  expect(band.className).toMatch(/border-t/);
});

it("shows links in a note as links (preflight otherwise renders them as plain text)", () => {
  render(
    <ActivityCard
      activity={makeActivity({ note: '<p><a href="https://example.com">agenda</a></p>' })}
      at={AT}
    />,
  );
  const band = screen.getByTestId("activity-note");
  expect(band.className).toMatch(/\[&_a\]:text-link/);
  expect(band.className).toMatch(/\[&_a\]:underline/);
});

it("turns a bare URL typed in a note into a link (no editor autolink)", () => {
  render(
    <ActivityCard
      activity={makeActivity({ note: "<p>agenda https://example.com/x.</p>" })}
      at={AT}
    />,
  );
  const link = screen.getByRole("link", { name: "https://example.com/x" });
  expect(link).toHaveAttribute("href", "https://example.com/x");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.getByTestId("activity-note")).toHaveTextContent("agenda https://example.com/x.");
});

it("does not nest a second anchor inside a link the editor already made", () => {
  render(
    <ActivityCard
      activity={makeActivity({
        note: '<p><a href="https://example.com">https://example.com</a></p>',
      })}
      at={AT}
    />,
  );
  expect(screen.getAllByRole("link", { name: "https://example.com" })).toHaveLength(1);
});

it("opens a note's email link in a new tab when the interface preference is on", () => {
  render(
    <InterfacePrefsProvider value={{ ...INTERFACE_PREFS_DEFAULT, emailLinksNewTab: true }}>
      <ActivityCard activity={makeActivity({ note: "<p>cc ann@example.com</p>" })} at={AT} />
    </InterfacePrefsProvider>,
  );
  expect(screen.getByRole("link", { name: "ann@example.com" })).toHaveAttribute("target", "_blank");
});
