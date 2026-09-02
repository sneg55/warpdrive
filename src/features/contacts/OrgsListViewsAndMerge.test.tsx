// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts/orgs" }));

const listOrgsQuery = vi.fn();
const savedViews = vi.fn<() => unknown[]>(() => []);
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      client: { contacts: { listOrgs: { query: listOrgsQuery } } },
      savedFilters: { listByTarget: { invalidate: vi.fn() } },
    }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
    savedFilters: { listByTarget: { useQuery: () => ({ data: savedViews() }) } },
  },
}));

const deleteOrgAction = vi.fn();
const mergeOrgsAction = vi.fn();
vi.mock("./actions", () => ({
  deleteOrgAction: (...a: unknown[]) => deleteOrgAction(...a),
  mergeOrgsAction: (...a: unknown[]) => mergeOrgsAction(...a),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));

import { OrgsList } from "./OrgsList";
import type { OrgsListRow } from "./OrgsTable";

const EMPTY_REF_LABELS = { user: {}, person: {}, org: {} };

afterEach(() => {
  listOrgsQuery.mockReset();
  mergeOrgsAction.mockReset();
  savedViews.mockReturnValue([]);
});

function orgRow(id: string, name: string, overrides?: Partial<OrgsListRow>): OrgsListRow {
  return {
    id,
    name,
    address: null,
    customFields: {},
    peopleCount: 0,
    closedDeals: 0,
    openDeals: 0,
    ...overrides,
  };
}

describe("OrgsList saved views and merge", () => {
  it("applies a saved org view to the list query", async () => {
    savedViews.mockReturnValue([
      {
        id: "v1",
        name: "SaaS orgs",
        favorite: false,
        isShared: false,
        isOwn: true,
        definition: {
          combinator: "and",
          conditions: [{ field: "industry", op: "eq", value: "SaaS" }],
        },
      },
    ]);
    listOrgsQuery.mockResolvedValue({ total: 0, rows: [], refLabels: EMPTY_REF_LABELS });
    const user = userEvent.setup();
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={1} />);

    await user.click(screen.getByRole("button", { name: "Saved views" }));
    await user.click(screen.getByRole("menuitem", { name: "SaaS orgs" }));

    await vi.waitFor(() =>
      expect(listOrgsQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            combinator: "and",
            conditions: [{ field: "industry", op: "eq", value: "SaaS" }],
          },
        }),
      ),
    );
  });

  it("merges the two selected orgs via mergeOrgsAction, gated on exactly two", async () => {
    mergeOrgsAction.mockResolvedValue({ ok: true, value: { id: "o1" } });
    listOrgsQuery.mockResolvedValue({ total: 1, rows: [], refLabels: EMPTY_REF_LABELS });
    render(<OrgsList rows={[orgRow("o1", "Acme Inc"), orgRow("o2", "Globex")]} total={2} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme Inc" }));
    expect(screen.queryByRole("button", { name: "Merge duplicates" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Globex" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge duplicates" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await vi.waitFor(() =>
      expect(mergeOrgsAction).toHaveBeenCalledWith(
        { survivorId: "o1", mergedId: "o2", fieldChoices: {} },
        "csrf",
      ),
    );
  });
});
