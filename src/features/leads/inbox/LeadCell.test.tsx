// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeadRow } from "../leadRepo";

vi.mock("@/lib/trpc-client", () => ({
  trpc: { labels: { listByTarget: { useQuery: () => ({ data: [] }) } } },
}));

import { LeadCell } from "./LeadCell";

afterEach(cleanup);

// Minimal row; LeadCell's nextActivity column only reads nextActivityAt.
function row(nextActivityAt: string | null): LeadRow {
  return {
    id: "l1",
    title: "Lead",
    value: null,
    labels: [],
    sourceOrigin: "manually_created",
    personName: null,
    orgName: null,
    ownerName: null,
    nextActivityAt,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    convertedDealId: null,
  } as unknown as LeadRow;
}

describe("LeadCell nextActivity clock (F5-16)", () => {
  const overdue = "2020-01-01T00:00:00.000Z";

  it("renders a neutral (non-overdue) baseline when the clock is not yet set (null)", () => {
    // On the server render and the first client render `now` is null so SSR and hydration agree;
    // the time-based overdue color must NOT be applied yet (that is what caused the board's
    // hydration mismatch). It must render, not crash, with no destructive color.
    const { container } = render(
      <LeadCell columnKey="nextActivity" row={row(overdue)} now={null} currency="USD" />,
    );
    expect(container.querySelector(".text-destructive")).toBeNull();
    expect(container.textContent).not.toBe("");
  });

  it("applies the overdue color once the client clock is set", () => {
    const { container } = render(
      <LeadCell
        columnKey="nextActivity"
        row={row(overdue)}
        now={new Date("2026-06-01T00:00:00.000Z")}
        currency="USD"
      />,
    );
    expect(container.querySelector(".text-destructive")).not.toBeNull();
  });
});
