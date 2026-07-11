// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts/people" }));

// listPeople.query returns raw Person-shaped rows; the client maps them into PeopleListRow.
const listPeopleQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ client: { contacts: { listPeople: { query: listPeopleQuery } } } }),
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
  },
}));

const deletePersonAction = vi.fn();
const mergePersonsAction = vi.fn();
vi.mock("./actions", () => ({
  deletePersonAction: (...a: unknown[]) => deletePersonAction(...a),
  mergePersonsAction: (...a: unknown[]) => mergePersonsAction(...a),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/identity/preferencesActions", () => ({ setColumnViewAction: vi.fn() }));

import { PeopleList } from "./PeopleList";

afterEach(() => {
  cleanup();
  listPeopleQuery.mockReset();
  deletePersonAction.mockReset();
  mergePersonsAction.mockReset();
});

const rows = [
  {
    id: "p1",
    name: "Jane Roe",
    primaryEmail: "jane@acme.com",
    phone: "+14155550100",
    orgId: "o1",
    orgName: "Acme Inc",
    closedDeals: 0,
  },
  {
    id: "p2",
    name: "John Doe",
    primaryEmail: null,
    phone: null,
    orgId: null,
    orgName: null,
    closedDeals: 0,
  },
];

describe("PeopleList", () => {
  it("shows an initial avatar and the phone for each person (Pipedrive-style row)", () => {
    render(<PeopleList rows={rows} total={2} />);
    const avatar = screen.getByRole("img", { name: "Jane Roe" });
    expect(avatar).toHaveTextContent("JR");
    expect(screen.getByText("+14155550100")).toBeInTheDocument();
    const janeRow = screen.getByText("Jane Roe").closest("tr");
    expect(within(janeRow as HTMLElement).getByRole("link", { name: "Jane Roe" })).toHaveAttribute(
      "href",
      "/contacts/people/p1",
    );
  });

  it("shows an Organization column linking to the org", () => {
    render(<PeopleList rows={rows} total={2} />);
    expect(screen.getByRole("columnheader", { name: "Organization" })).toBeInTheDocument();
    const janeRow = screen.getByText("Jane Roe").closest("tr") as HTMLElement;
    expect(within(janeRow).getByRole("link", { name: "Acme Inc" })).toHaveAttribute(
      "href",
      "/contacts/orgs/o1",
    );
  });

  it("hides Load more when every person is already loaded", () => {
    render(<PeopleList rows={rows} total={2} />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("fetches and appends the next page, resolving org names from the supplied map", async () => {
    listPeopleQuery.mockResolvedValue({
      total: 3,
      rows: [
        {
          id: "p3",
          name: "Zed Zephyr",
          primaryEmail: "zed@globex.com",
          phones: [{ label: "work", value: "+1999", primary: true }],
          orgId: "o2",
        },
      ],
    });
    render(<PeopleList rows={rows} total={3} orgNames={{ o2: "Globex" }} />);
    const loadMore = screen.getByRole("button", { name: /load more/i });
    fireEvent.click(loadMore);
    // Fetches starting at the current loaded count.
    await vi.waitFor(() =>
      expect(listPeopleQuery).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 2, limit: 50 }),
      ),
    );
    await screen.findByText("Zed Zephyr");
    const zedRow = screen.getByText("Zed Zephyr").closest("tr") as HTMLElement;
    expect(within(zedRow).getByRole("link", { name: "Globex" })).toHaveAttribute(
      "href",
      "/contacts/orgs/o2",
    );
    // All three now loaded, so the affordance is gone.
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("surfaces a load-more failure as an inline alert instead of swallowing it", async () => {
    listPeopleQuery.mockRejectedValueOnce(new Error("timeout"));
    render(<PeopleList rows={rows} total={3} />);
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load more|could not load more|failed/i);
    // The button returns so the user can retry (not stuck in "Loading...").
    expect(screen.getByRole("button", { name: /load more/i })).toBeEnabled();
  });

  it("clears the error after a successful retry", async () => {
    listPeopleQuery.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({
      total: 3,
      rows: [
        {
          id: "p3",
          name: "Zed Zephyr",
          primaryEmail: null,
          phones: [],
          orgId: null,
        },
      ],
    });
    render(<PeopleList rows={rows} total={3} />);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText("Zed Zephyr");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("selecting a row shows the bulk action bar with a count", () => {
    render(<PeopleList rows={rows} total={2} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Jane Roe" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("selecting all visible rows checks the header checkbox", () => {
    render(<PeopleList rows={rows} total={2} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all people" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all people" })).toBeChecked();
  });

  it("clicking the Name header re-queries listPeople with the new sort", async () => {
    listPeopleQuery.mockResolvedValue({ total: 2, rows: [] });
    render(<PeopleList rows={rows} total={2} />);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));

    await vi.waitFor(() =>
      expect(listPeopleQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 0,
          limit: 50,
          sort: { field: "name", dir: "asc" },
        }),
      ),
    );
  });

  it("bulk-deletes the selected people and clears the selection", async () => {
    deletePersonAction.mockResolvedValue({ ok: true, value: { id: "p1" } });
    listPeopleQuery.mockResolvedValue({ total: 1, rows: [] });
    render(<PeopleList rows={rows} total={2} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Jane Roe" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(deletePersonAction).toHaveBeenCalledWith({ id: "p1" }, "csrf"));
    await vi.waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it("keeps the failed row selected and surfaces an error on a partial bulk-delete failure", async () => {
    deletePersonAction.mockImplementation((input: { id: string }) =>
      Promise.resolve(
        input.id === "p1"
          ? { ok: true, value: { id: "p1" } }
          : { ok: false, error: { id: "E_PERM_001" } },
      ),
    );
    // p1's delete succeeded so it's gone from the reloaded list; p2's failed so it's still there.
    listPeopleQuery.mockResolvedValue({
      total: 1,
      rows: [{ id: "p2", name: "John Doe", primaryEmail: null, phones: [], orgId: null }],
    });
    render(<PeopleList rows={rows} total={2} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all people" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't delete|could not delete|failed/i);
    await vi.waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Select John Doe" })).toBeChecked();
  });

  it("offers Merge duplicates only when exactly two people are selected", () => {
    render(<PeopleList rows={rows} total={2} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Jane Roe" }));
    expect(screen.queryByRole("button", { name: "Merge duplicates" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select John Doe" }));
    expect(screen.getByRole("button", { name: "Merge duplicates" })).toBeInTheDocument();
  });

  it("merges the two selected people via mergePersonsAction (survivor kept)", async () => {
    mergePersonsAction.mockResolvedValue({ ok: true, value: { id: "p1" } });
    listPeopleQuery.mockResolvedValue({ total: 1, rows: [] });
    render(<PeopleList rows={rows} total={2} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Jane Roe" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select John Doe" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge duplicates" }));
    // Confirm in the opened dialog (survivor defaults to the first selected, p1).
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    await vi.waitFor(() =>
      expect(mergePersonsAction).toHaveBeenCalledWith(
        { survivorId: "p1", mergedId: "p2", fieldChoices: {} },
        "csrf",
      ),
    );
  });
});
