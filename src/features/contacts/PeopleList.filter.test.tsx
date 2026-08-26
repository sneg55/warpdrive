// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts/people" }));

const listPeopleQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      client: { contacts: { listPeople: { query: listPeopleQuery } } },
      savedFilters: { listByTarget: { invalidate: vi.fn() } },
    }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
    savedFilters: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("./actions", () => ({ deletePersonAction: vi.fn(), mergePersonsAction: vi.fn() }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));

import { PeopleList } from "./PeopleList";

afterEach(() => {
  cleanup();
  listPeopleQuery.mockReset();
});

const ROWS = [
  {
    id: "p1",
    name: "Jane Roe",
    primaryEmail: "jane@acme.com",
    phone: null,
    orgId: null,
    orgName: null,
    closedDeals: 0,
  },
];

function openFilter(): void {
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
}

function addRow(index: number, value: string): void {
  fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
  fireEvent.change(screen.getByLabelText(`Condition ${index} value`), { target: { value } });
}

describe("PeopleList filter round trip", () => {
  it("reopening the filter shows the applied rows and combinator, not a blank builder", async () => {
    listPeopleQuery.mockResolvedValue({ total: 0, rows: [] });
    render(<PeopleList rows={ROWS} total={1} />);

    openFilter();
    addRow(1, "acme");
    addRow(2, "globex");
    fireEvent.click(screen.getByLabelText("Match combinator"));
    fireEvent.click(screen.getByRole("option", { name: "any condition" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await vi.waitFor(() =>
      expect(listPeopleQuery).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expect.objectContaining({ combinator: "or" }) }),
      ),
    );

    openFilter();
    expect(screen.getByLabelText("Condition 1 value")).toHaveValue("acme");
    expect(screen.getByLabelText("Condition 2 value")).toHaveValue("globex");
    expect(screen.getByLabelText("Match combinator")).toHaveTextContent("any condition");
  });
});
