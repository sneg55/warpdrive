// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./useInlineEdit", () => ({
  useInlineEdit: () => ({ editCell: vi.fn() }),
}));

import { DealList, type DealListRow } from "./DealList";
import { DEAL_LIST_COLUMNS } from "./dealListColumns";

afterEach(cleanup);

const row: DealListRow = {
  id: "d1",
  title: "Deal 1",
  value: "1000.00",
  stageId: "s1",
  boardPosition: "1",
  ownerId: "u1",
  personId: null,
  orgId: null,
  ownerName: "User A",
  orgName: null,
  nextActivityAt: null,
  lastActivityAt: null,
  stageEnteredAt: new Date("2026-06-24T00:00:00Z"),
  updatedAt: "2026-06-24T00:00:00Z",
  customFields: {},
};

it("the row Unarchive goes busy and ignores a second click while the first is in flight", async () => {
  let settle = (): void => {};
  const onUnarchive = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        settle = () => resolve(true);
      }),
  );
  render(
    <DealList
      pipelineId="p1"
      rows={[row]}
      total={1}
      totalValue="1000.00"
      stages={[{ id: "s1", name: "Qualified" }]}
      onBulkStage={() => Promise.resolve(true)}
      onUnarchive={onUnarchive}
      visibleColumns={DEAL_LIST_COLUMNS.filter((c) => c.defaultVisible === true)}
      currency="USD"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));
  const busy = await screen.findByRole("button", { name: "Unarchiving" });
  fireEvent.click(busy);

  expect(busy).toBeDisabled();
  expect(onUnarchive).toHaveBeenCalledTimes(1);
  expect(onUnarchive).toHaveBeenCalledWith("d1");
  settle();
});
