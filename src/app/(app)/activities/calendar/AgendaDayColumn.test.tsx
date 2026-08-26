// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    allDay: false,
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

function renderColumn(items: CalendarActivity[], onOpenActivity = vi.fn(), onOpenSlot = vi.fn()) {
  render(
    <AgendaDayColumn
      iso="2026-07-15"
      dayLabel="Wednesday 15 July 2026"
      items={items}
      onOpenActivity={onOpenActivity}
      onOpenSlot={onOpenSlot}
    />,
  );
  return { onOpenActivity, onOpenSlot };
}

function fiveAtNine(): CalendarActivity[] {
  return ["a", "b", "c", "d", "e"].map((id) => mk(id, new Date(2026, 6, 15, 9, 0), 60));
}

describe("AgendaDayColumn", () => {
  it("names the day it belongs to, so its activities are not an unlabelled run of buttons", () => {
    renderColumn([]);
    expect(screen.getByRole("group", { name: "Wednesday 15 July 2026" })).toBeInTheDocument();
  });

  it("clamps a late block's height to the remaining hours instead of overflowing past midnight", () => {
    // 23:00 + 120min naturally spans 2 hour-lanes, but only 1 hour remains before midnight.
    renderColumn([mk("late", new Date(2026, 6, 15, 23, 0), 120)]);
    const chip = screen.getByRole("button", { name: "Activity late" });
    expect(chip.parentElement?.style.height).toBe(`${HOUR_HEIGHT_PX}px`);
  });

  it("leaves a block that fits within the day unclamped", () => {
    renderColumn([mk("normal", new Date(2026, 6, 15, 9, 0), 60)]);
    const chip = screen.getByRole("button", { name: "Activity normal" });
    expect(chip.parentElement?.style.height).toBe(`${HOUR_HEIGHT_PX}px`);
  });

  it("lays two overlapping activities side by side instead of one covering the other", () => {
    renderColumn([
      mk("first", new Date(2026, 6, 15, 9, 0), 60),
      mk("second", new Date(2026, 6, 15, 9, 30), 60),
    ]);
    const first = screen.getByRole("button", { name: "Activity first" }).parentElement;
    const second = screen.getByRole("button", { name: "Activity second" }).parentElement;
    expect([first?.style.left, first?.style.width]).toEqual(["0%", "50%"]);
    expect([second?.style.left, second?.style.width]).toEqual(["50%", "50%"]);
  });

  it("makes the whole timed block clickable, not just its first line of text", () => {
    renderColumn([mk("normal", new Date(2026, 6, 15, 9, 0), 120)]);
    expect(screen.getByRole("button", { name: "Activity normal" })).toHaveClass("h-full");
  });

  it("collapses the activities past the lane cap into a counted more-chip", () => {
    renderColumn(fiveAtNine());
    expect(screen.getByRole("button", { name: "Show 4 more activities" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activity e" })).toBeNull();
  });

  it("gives the more-chip a pixel floor so the count itself is never what gets clipped", () => {
    // 30% of a 180px column is 54px, which rendered "+5 more" as "+5 ...".
    renderColumn(fiveAtNine());
    const block = screen.getByRole("button", { name: "Show 4 more activities" }).parentElement;
    expect(block).toHaveClass("w-[min(max(30%,5rem),60%)]", "right-0");
  });

  it("caps the more-chip so a narrow column cannot starve the chip beside it", () => {
    // Without the 60% ceiling the 5rem floor outgrows a narrow column: the more-chip spills over
    // the neighbour and the surviving chip collapses to nothing, hiding an activity that is not in
    // the more-chip's own list.
    renderColumn(fiveAtNine());
    const block = screen.getByRole("button", { name: "Show 4 more activities" }).parentElement;
    expect(block?.className).toContain(",60%)]");
  });

  it("gives the surviving chip whatever the more-chip does not take", () => {
    renderColumn(fiveAtNine());
    const chip = screen.getByRole("button", { name: "Activity a" }).parentElement;
    expect(chip).toHaveClass("w-[calc(100%-min(max(30%,5rem),60%))]");
    expect(chip?.style.width).toBe("");
  });

  it("lists what the more-chip stands for, so nothing is unreachable from the calendar", () => {
    const items = fiveAtNine();
    const { onOpenActivity } = renderColumn(items);
    fireEvent.click(screen.getByRole("button", { name: "Show 4 more activities" }));
    fireEvent.click(screen.getByRole("button", { name: /Activity e/ }));
    expect(onOpenActivity).toHaveBeenCalledWith(items[4]);
  });

  it("lets a click land on the hour underneath the tall part of an overflow block", () => {
    renderColumn([
      mk("a", new Date(2026, 6, 15, 9, 0), 240),
      mk("b", new Date(2026, 6, 15, 9, 0), 240),
      mk("c", new Date(2026, 6, 15, 9, 0), 60),
      mk("d", new Date(2026, 6, 15, 11, 0), 60),
    ]);
    const trigger = screen.getByRole("button", { name: "Show 3 more activities" });
    expect(trigger.parentElement?.style.pointerEvents).toBe("none");
    expect(trigger.style.pointerEvents).toBe("auto");
  });

  it("puts the activities ahead of the empty hour lanes in the tab order", () => {
    // The lanes are an affordance; the activities are the content. Rendered lanes-first, a keyboard
    // user walked 24 empty hours before reaching anything real.
    renderColumn([mk("real", new Date(2026, 6, 15, 14, 0), 60)]);
    const chip = screen.getByRole("button", { name: "Activity real" });
    const firstSlot = screen.getByRole("button", { name: "Add activity on 2026-07-15 at 00:00" });
    expect(chip.compareDocumentPosition(firstSlot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts one hour lane in the tab order, not all twenty-four", () => {
    renderColumn([]);
    const tabbable = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("tabindex") !== "-1");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName("Add activity on 2026-07-15 at 08:00");
  });

  it("walks the hours with the arrow keys once a lane has focus", () => {
    renderColumn([]);
    const start = screen.getByRole("button", { name: "Add activity on 2026-07-15 at 08:00" });
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowDown" });
    expect(
      screen.getByRole("button", { name: "Add activity on 2026-07-15 at 09:00" }),
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(start).toHaveFocus();
  });

  it("stops at the ends of the day rather than wrapping around midnight", () => {
    renderColumn([]);
    const first = screen.getByRole("button", { name: "Add activity on 2026-07-15 at 00:00" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(first).toHaveFocus();
  });
});
