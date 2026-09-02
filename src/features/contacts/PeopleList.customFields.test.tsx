// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";

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

const seatsDef: CustomFieldDef = {
  id: "cf-seats",
  targetEntity: "person",
  type: "numeric",
  name: "Seats",
  key: "seats",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: true,
  order: 0,
  archivedAt: null,
};

const championDef: CustomFieldDef = {
  id: "cf-champion",
  targetEntity: "person",
  type: "user",
  name: "Champion",
  key: "champion",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: true,
  order: 1,
  archivedAt: null,
};

const cfRows = [
  {
    id: "p1",
    name: "Jane Roe",
    primaryEmail: "jane@acme.com",
    phone: null,
    orgId: null,
    orgName: null,
    closedDeals: 0,
    customFields: { seats: 10, champion: "u1" },
  },
];

describe("PeopleList custom-field columns", () => {
  it("lists a custom field under Hidden in the columns menu", () => {
    render(<PeopleList rows={cfRows} total={1} customFieldDefs={[seatsDef]} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize columns" }));
    expect(screen.getByRole("checkbox", { name: "Seats" })).toBeInTheDocument();
  });

  it("shows the header and cell value after toggling a custom field on", () => {
    render(<PeopleList rows={cfRows} total={1} customFieldDefs={[seatsDef]} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seats" }));
    expect(screen.getByRole("columnheader", { name: "Seats" })).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("resolves a reference field's name from refLabels", () => {
    render(
      <PeopleList
        rows={cfRows}
        total={1}
        customFieldDefs={[championDef]}
        refLabels={{ user: { u1: "Alex Kim" }, person: {}, org: {} }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Customize columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Champion" }));
    expect(screen.getByText("Alex Kim")).toBeInTheDocument();
  });

  it("resolves a load-more row's reference field from the appended page's refLabels", async () => {
    listPeopleQuery.mockResolvedValue({
      total: 2,
      rows: [
        {
          id: "p2",
          name: "Sam Lee",
          primaryEmail: null,
          phones: [],
          orgId: null,
          closedDeals: 0,
          customFields: { champion: "u2" },
        },
      ],
      refLabels: { user: { u2: "Priya Nair" }, person: {}, org: {} },
    });
    render(
      <PeopleList
        rows={cfRows}
        total={2}
        customFieldDefs={[championDef]}
        refLabels={{ user: { u1: "Alex Kim" }, person: {}, org: {} }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Customize columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Champion" }));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText("Sam Lee");
    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
  });
});
