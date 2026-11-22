// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { DealCard } from "./DealCard";

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
      currency="USD"
      now={now}
    />,
  );
}

describe("DealCard rot tint", () => {
  it("tints the card light red at rot level 1 (just past the threshold)", () => {
    renderAt("2026-06-13T00:00:00Z");
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).toContain("bg-red-50");
    expect(card.className).not.toContain("bg-red-200");
  });

  it("tints the card strong red at rot level 3 (most alerting)", () => {
    renderAt("2026-06-08T00:00:00Z");
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).toContain("bg-red-200");
  });

  it("never rots a closed deal, however long it has sat in its last stage", () => {
    for (const status of ["won", "lost"] as const) {
      cleanup();
      render(
        <DealCard
          card={{ ...baseCard, status, stageEnteredAt: new Date("2026-06-08T00:00:00Z") }}
          ownerName="A.K."
          personName={null}
          orgName={null}
          labels={[]}
          rottingDays={6}
          density="comfortable"
          currency="USD"
          now={now}
        />,
      );
      const card = screen.getByRole("button", { name: /Acme renewal/ });
      expect(card.className, status).not.toMatch(/bg-red-\d/);
      expect(screen.queryByRole("status", { name: /rotting/ }), status).toBeNull();
    }
  });

  it("does not tint a healthy card (age at or below the threshold)", () => {
    renderAt("2026-06-16T00:00:00Z");
    const card = screen.getByRole("button", { name: /Acme renewal/ });
    expect(card.className).not.toMatch(/bg-red-\d/);
  });
});
