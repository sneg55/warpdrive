// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RenderWindow } from "@/components/data-table/useRenderWindow";
import { ActivityTableBody } from "./ActivityTableBody";
import type { ActivityTableRow } from "./activityRows";

afterEach(cleanup);

const EMPTY_WINDOW: RenderWindow<ActivityTableRow> = {
  visible: [],
  hasMore: false,
  remaining: 0,
  showMore: () => {},
};

function renderBody(props: { loadPending: boolean; loadFailed: boolean }): void {
  render(
    <table>
      <tbody>
        <ActivityTableBody
          loadFailed={props.loadFailed}
          loadPending={props.loadPending}
          rowWindow={EMPTY_WINDOW}
          groupByDay={false}
          renderRow={() => null}
          columnCount={7}
          onRetry={() => {}}
        />
      </tbody>
    </table>,
  );
}

describe("ActivityTableBody loading state", () => {
  it("reserves the row layout with a labelled skeleton while rows are pending", () => {
    renderBody({ loadPending: true, loadFailed: false });
    expect(screen.getByRole("status", { name: /loading activities/i })).toBeInTheDocument();
    expect(screen.queryByText(/No activities in this view/)).toBeNull();
    // More than one placeholder row, so the table does not collapse and jump when data lands.
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("shows the empty copy only once the query has resolved", () => {
    renderBody({ loadPending: false, loadFailed: false });
    expect(screen.getByText(/No activities in this view/)).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /loading activities/i })).toBeNull();
  });
});
