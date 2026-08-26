// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { DealCard } from "./DealCard";
import { baseCard } from "./dealCardTestFixture";

// The next-action badge: a colored circle whose color encodes urgency and whose aria-label (also the
// hover tooltip) names the soonest action and its timing. Split out of DealCard.test.tsx to keep
// each test file under the size limit. The fills are semantic tokens, not palette literals: white
// on the raw red / amber / yellow measured 3.81:1, 2.13:1 and 1.57:1, and none carried a night value.
describe("DealCard activity badge", () => {
  it("shows a red circular next-action indicator when the activity is overdue", () => {
    render(
      <DealCard
        card={{ ...baseCard, nextActivityAt: new Date("2026-06-01T00:00:00Z") }}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    const ind = screen.getByRole("img", { name: "Activity · 9 days overdue" });
    expect(ind.className).toContain("rounded-full");
    expect(ind.className).toContain("bg-destructive");
    expect(ind.className).toContain("text-destructive-foreground");
    // The old text pill must be gone.
    expect(screen.queryByText("overdue")).toBeNull();
  });

  it("shows a GREEN circular indicator when an activity is due today", () => {
    render(
      <DealCard
        card={{ ...baseCard, nextActivityAt: new Date("2026-06-10T09:00:00Z") }}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T15:00:00Z")}
      />,
    );
    const ind = screen.getByRole("img", { name: "Activity · today" });
    expect(ind.className).toContain("bg-action");
    expect(ind.className).not.toContain("bg-destructive");
  });

  it("shows a YELLOW warning indicator when there is no next activity (schedule-one nudge, not gray)", () => {
    render(
      <DealCard
        card={baseCard}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    const ind = screen.getByRole("img", { name: "No activity scheduled" });
    expect(ind.className).toContain("rounded-full");
    // Amber attention fill with dark amber ink, no longer the muted gray dot or white on yellow.
    expect(ind.className).toContain("bg-attention");
    expect(ind.className).toContain("text-attention-foreground");
    expect(ind.className).not.toContain("bg-muted");
    expect(ind.className).not.toContain("text-white");
    // A warning glyph, not the chevron the scheduled states use.
    expect(ind.textContent).toBe("!");
  });

  // A scheduled activity is the healthy state and nothing planned is a nudge, so they cannot
  // share a fill. They did, and a 10px chevron against a 10px "!" was the only thing telling
  // a calm card from one that needed work.
  it("does not paint a scheduled activity in the warning fill", () => {
    render(
      <DealCard
        card={{ ...baseCard, nextActivityAt: new Date("2026-06-14T09:00:00Z") }}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    const ind = screen.getByRole("img", { name: "Activity · in 4 days" });
    expect(ind.className).toContain("bg-scheduled");
    expect(ind.className).toContain("text-scheduled-foreground");
    expect(ind.className).not.toContain("bg-attention");
    expect(ind.textContent).toBe("›");
  });

  it("labels the badge with the action title and overdue days (a11y non-color cue + tooltip)", () => {
    render(
      <DealCard
        card={{
          ...baseCard,
          nextActivityAt: new Date("2026-06-05T00:00:00Z"),
          nextActivityTitle: "Call Acme back",
        }}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    expect(screen.getByRole("img", { name: "Call Acme back · 5 days overdue" })).not.toBeNull();
  });

  it("names the next action and 'today' when it is due today", () => {
    render(
      <DealCard
        card={{
          ...baseCard,
          nextActivityAt: new Date("2026-06-10T09:00:00Z"),
          nextActivityTitle: "Send the contract",
        }}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T15:00:00Z")}
      />,
    );
    expect(screen.getByRole("img", { name: "Send the contract · today" })).not.toBeNull();
  });

  it("falls back to a generic 'Activity' noun in the label when the title is unknown", () => {
    render(
      <DealCard
        card={{ ...baseCard, nextActivityAt: new Date("2026-06-05T00:00:00Z") }}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={null}
        density="comfortable"
        now={new Date("2026-06-10T00:00:00Z")}
      />,
    );
    expect(screen.getByRole("img", { name: "Activity · 5 days overdue" })).not.toBeNull();
  });
});
