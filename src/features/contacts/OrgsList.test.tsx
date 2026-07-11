// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts/orgs" }));

const listOrgsQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ client: { contacts: { listOrgs: { query: listOrgsQuery } } } }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
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

afterEach(() => {
  cleanup();
  listOrgsQuery.mockReset();
  deleteOrgAction.mockReset();
  mergeOrgsAction.mockReset();
});

// Builds a full OrgsListRow with sensible defaults for the fields a given test doesn't care
// about (address/peopleCount/closedDeals/openDeals), so selection/sort/bulk-delete tests stay focused.
function orgRow(id: string, name: string, overrides?: Partial<OrgsListRow>): OrgsListRow {
  return { id, name, address: null, peopleCount: 0, closedDeals: 0, openDeals: 0, ...overrides };
}

describe("OrgsList", () => {
  it("shows an avatar and a link to the org detail for each row", () => {
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={1} />);
    expect(screen.getByRole("img", { name: "Acme Inc" })).toHaveTextContent("AI");
    const row = screen.getByText("Acme Inc").closest("tr") as HTMLElement;
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/contacts/orgs/o1");
  });

  it("renders the empty state when there are no orgs", () => {
    render(<OrgsList rows={[]} total={0} />);
    expect(screen.getByText(/no organizations/i)).toBeInTheDocument();
  });

  it("hides Load more when every org is already loaded", () => {
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={1} />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("fetches and appends the next page of orgs on Load more", async () => {
    listOrgsQuery.mockResolvedValue({
      total: 2,
      rows: [
        { id: "o2", name: "Globex", address: null, peopleCount: 0, closedDeals: 0, openDeals: 0 },
      ],
    });
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={2} />);
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await vi.waitFor(() =>
      expect(listOrgsQuery).toHaveBeenCalledWith(expect.objectContaining({ offset: 1, limit: 50 })),
    );
    await screen.findByText("Globex");
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("surfaces a load-more failure as an inline alert instead of swallowing it", async () => {
    listOrgsQuery.mockRejectedValueOnce(new Error("timeout"));
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={2} />);
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load more|could not load more|failed/i);
    expect(screen.getByRole("button", { name: /load more/i })).toBeEnabled();
  });

  it("clears the error after a successful retry", async () => {
    listOrgsQuery.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({
      total: 2,
      rows: [
        { id: "o2", name: "Globex", address: null, peopleCount: 0, closedDeals: 0, openDeals: 0 },
      ],
    });
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={2} />);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText("Globex");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // CV-4 / spec B4: PD org list defaults to Address / Closed deals / Open deals (People is opt-in).
  it("renders Address, Closed deals, and Open deals columns with the row's data", () => {
    render(
      <OrgsList
        rows={[
          orgRow("o1", "Acme Inc", {
            address: { city: "Austin", country: "US" },
            peopleCount: 3,
            closedDeals: 1,
            openDeals: 2,
          }),
        ]}
        total={1}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Address" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Closed deals" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Open deals" })).toBeInTheDocument();
    // People is not a default column now (opt-in), so its header must be absent.
    expect(screen.queryByRole("columnheader", { name: "People" })).not.toBeInTheDocument();

    const row = screen.getByText("Acme Inc").closest("tr") as HTMLElement;
    expect(within(row).getByText("Austin, US")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("renders a blank Address cell when the org has no address", () => {
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={1} />);
    const row = screen.getByText("Acme Inc").closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell");
    // checkbox, name, address, people, deals: address is the third cell and should be empty.
    expect(cells[2]).toHaveTextContent("");
  });

  it("selecting a row shows the bulk action bar with a count", () => {
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={1} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme Inc" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("selecting all visible rows checks the header checkbox", () => {
    render(<OrgsList rows={[orgRow("o1", "Acme Inc"), orgRow("o2", "Globex")]} total={2} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all organizations" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all organizations" })).toBeChecked();
  });

  it("clicking the Name header re-queries listOrgs with the new sort", async () => {
    listOrgsQuery.mockResolvedValue({ total: 1, rows: [] });
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));

    await vi.waitFor(() =>
      expect(listOrgsQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 0,
          limit: 50,
          sort: { field: "name", dir: "asc" },
        }),
      ),
    );
  });

  it("bulk-deletes the selected orgs and clears the selection", async () => {
    deleteOrgAction.mockResolvedValue({ ok: true, value: { id: "o1" } });
    listOrgsQuery.mockResolvedValue({ total: 0, rows: [] });
    render(<OrgsList rows={[orgRow("o1", "Acme Inc")]} total={1} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme Inc" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(deleteOrgAction).toHaveBeenCalledWith({ id: "o1" }, "csrf"));
    await vi.waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it("keeps the failed row selected and surfaces an error on a partial bulk-delete failure", async () => {
    deleteOrgAction.mockImplementation((input: { id: string }) =>
      Promise.resolve(
        input.id === "o1"
          ? { ok: true, value: { id: "o1" } }
          : { ok: false, error: { id: "E_PERM_001" } },
      ),
    );
    // o1's delete succeeded so it's gone from the reloaded list; o2's failed so it's still there.
    listOrgsQuery.mockResolvedValue({
      total: 1,
      rows: [
        { id: "o2", name: "Globex", address: null, peopleCount: 0, closedDeals: 0, openDeals: 0 },
      ],
    });
    render(<OrgsList rows={[orgRow("o1", "Acme Inc"), orgRow("o2", "Globex")]} total={2} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all organizations" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't delete|could not delete|failed/i);
    await vi.waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Select Globex" })).toBeChecked();
  });

  it("merges the two selected orgs via mergeOrgsAction, gated on exactly two", async () => {
    mergeOrgsAction.mockResolvedValue({ ok: true, value: { id: "o1" } });
    listOrgsQuery.mockResolvedValue({ total: 1, rows: [] });
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
