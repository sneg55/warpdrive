// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { DealCard } from "./DealCard";

// Graded deal-rotting tint (Pipedrive shows aging deals reddening in steps). The rot level comes
// from rottingState; here we assert the DealCard maps each level to the right background tint.
const baseCard = {
  id: "d1",
  title: "Acme renewal",
  value: "25000.00",
  stageId: "s1",
  boardPosition: "1",
  ownerId: "u1",
  personId: "p1",
  orgId: "o1",
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const now = new Date("2026-06-20T00:00:00Z");

function renderAt(enteredAt: string) {
  return render(
    <DealCard
      card={{ ...baseCard, stageEnteredAt: new Date(enteredAt) }}
      ownerName="A.K."
      personName={null}
      orgName={null}
      labels={[]}
      rottingDays={6}
      density="comfortable"
      now={now}
    />,
  );
}

describe("DealCard rot tint", () => {
  it("tints the card light red at rot level 1 (just past the threshold)", () => {
    // age 7, R=6 -> level 1
    renderAt("2026-06-13T00:00:00Z");
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).toContain("bg-red-50");
    expect(card.className).not.toContain("bg-red-200");
  });

  it("tints the card strong red at rot level 3 (most alerting)", () => {
    // age 12, R=6 -> level 3
    renderAt("2026-06-08T00:00:00Z");
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).toContain("bg-red-200");
  });

  it("does not tint a healthy card (age at or below the threshold)", () => {
    // age 4, R=6 -> level 0
    renderAt("2026-06-16T00:00:00Z");
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).not.toMatch(/bg-red-\d/);
  });

  // The clock is seeded from the request, so a rotting card reads as rotting in the very first
  // paint. The card must never describe a deal that has an activity as having nothing scheduled:
  // an absent clock used to produce that claim, which is a wrong answer rather than a blank one.
  it("shows rot and the real activity state in the first render", () => {
    render(
      <DealCard
        card={{
          ...baseCard,
          stageEnteredAt: new Date("2026-06-08T00:00:00Z"),
          nextActivityAt: new Date("2026-06-18T09:00:00Z"),
          nextActivityTitle: "Discovery call",
        }}
        ownerName="A.K."
        personName={null}
        orgName={null}
        labels={[]}
        rottingDays={6}
        density="comfortable"
        now={new Date("2026-06-21T00:00:00Z")}
      />,
    );
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).toMatch(/bg-red-\d/);
    expect(screen.queryByLabelText("No activity scheduled")).toBeNull();
    expect(screen.getByLabelText("Discovery call · 3 days overdue")).not.toBeNull();
  });
});
