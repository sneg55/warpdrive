// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import { HOUR_HEIGHT_PX } from "@/features/activities/weekAgenda";
import { AgendaDayColumn } from "./AgendaDayColumn";

afterEach(() => {
  cleanup();
});

function mk(id: string, dueAt: Date, durationMinutes: number | null): CalendarActivity {
  return {
    id,
    subject: `Activity ${id}`,
    dueAt,
    durationMinutes,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: null,
  };
}

describe("AgendaDayColumn", () => {
  it("clamps a late block's height to the remaining hours in the day instead of overflowing past midnight", () => {
    // 23:00 + 120min naturally spans 2 hour-lanes, but only 1 hour remains before midnight. The
    // column wraps content in overflow-hidden, so an unclamped height silently clips the chip
    // instead of the layout reflecting only the time actually left in the day.
    const item = mk("late", new Date(2026, 6, 15, 23, 0), 120);
    render(
      <AgendaDayColumn
        iso="2026-07-15"
        items={[item]}
        onOpenActivity={vi.fn()}
        onOpenSlot={vi.fn()}
      />,
    );
    const chip = screen.getByRole("button", { name: "Activity late" });
    const wrapper = chip.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.height).toBe(`${HOUR_HEIGHT_PX}px`);
  });

  it("leaves a block that fits within the day unclamped", () => {
    const item = mk("normal", new Date(2026, 6, 15, 9, 0), 60);
    render(
      <AgendaDayColumn
        iso="2026-07-15"
        items={[item]}
        onOpenActivity={vi.fn()}
        onOpenSlot={vi.fn()}
      />,
    );
    const chip = screen.getByRole("button", { name: "Activity normal" });
    const wrapper = chip.parentElement;
    expect(wrapper?.style.height).toBe(`${HOUR_HEIGHT_PX}px`);
  });
});
