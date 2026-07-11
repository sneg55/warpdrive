// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import type { PeopleListRow } from "./PeopleTable";
import { PeopleTable } from "./PeopleTable";
import { PEOPLE_COLUMNS } from "./peopleColumns";

afterEach(cleanup);

const row: PeopleListRow = {
  id: "p1",
  name: "Jane Roe",
  primaryEmail: "jane@acme.com",
  phone: "4155551234",
  orgId: null,
  orgName: null,
  closedDeals: 0,
};

function renderTable(usPhoneFormat: boolean): void {
  const phoneCol = PEOPLE_COLUMNS.filter((c) => c.key === "phone");
  render(
    <InterfacePrefsProvider value={{ ...INTERFACE_PREFS_DEFAULT, usPhoneFormat }}>
      <PeopleTable
        rows={[row]}
        sort={{ field: "name", dir: "asc" }}
        onSort={vi.fn()}
        isSelected={() => false}
        allSelected={false}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        visibleColumns={phoneCol}
      />
    </InterfacePrefsProvider>,
  );
}

describe("PeopleTable phone formatting", () => {
  it("shows the raw phone when usPhoneFormat is off", () => {
    renderTable(false);
    expect(screen.getByText("4155551234")).toBeInTheDocument();
  });

  it("formats the phone column when usPhoneFormat is on", () => {
    renderTable(true);
    expect(screen.getByText("(415) 555-1234")).toBeInTheDocument();
  });
});
