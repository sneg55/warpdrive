// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// A label that records carry but the catalog does not know about. The app can no longer create
// that state (writers adopt unknown names into the catalog), but a direct database write still
// can, and a label visible on the list has to be selectable in the filter that claims to filter it.
// "hot" also exercises the dedupe: it is the same label as the catalog's "Hot" (every resolver
// matches case-insensitively), so it must not show up as a second, differently-cased option.
const appliedOnly = ["high priority", "hot"];

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    labels: {
      listByTarget: {
        useQuery: () => ({
          data: [{ id: "l1", target: "lead", name: "Hot", color: "red", order: 0 }],
        }),
      },
      appliedNames: { useQuery: () => ({ data: appliedOnly }) },
    },
  },
}));

import { LeadFilters, type OwnerFilter } from "./LeadFilters";

afterEach(cleanup);

function renderOwner(owner: OwnerFilter) {
  return render(
    <LeadFilters
      labelKeys={[]}
      onLabelKeys={() => {}}
      nextActivity={null}
      onNextActivity={() => {}}
      owner={owner}
    />,
  );
}

describe("LeadFilters label menu", () => {
  const owner: OwnerFilter = { users: [], selected: [], onChange: () => {} };

  it("offers catalog labels", async () => {
    const user = userEvent.setup();
    renderOwner(owner);
    await user.click(screen.getByRole("button", { name: "Label filter" }));
    expect(screen.getByRole("checkbox", { name: "Hot" })).toBeInTheDocument();
  });

  it("offers a label that records carry but the catalog is missing", async () => {
    const user = userEvent.setup();
    renderOwner(owner);
    await user.click(screen.getByRole("button", { name: "Label filter" }));
    expect(screen.getByRole("checkbox", { name: "high priority" })).toBeInTheDocument();
  });

  it("does not offer the same label twice when it is both catalogued and applied", async () => {
    const user = userEvent.setup();
    renderOwner(owner);
    await user.click(screen.getByRole("button", { name: "Label filter" }));
    expect(screen.getAllByRole("checkbox", { name: "Hot" })).toHaveLength(1);
  });
});

describe("LeadFilters owner menu (server-mode only)", () => {
  const users = [
    { id: "u1", name: "Ada" },
    { id: "u2", name: "Ben" },
  ];

  it("lists every assignable user, not just names on the page", async () => {
    const user = userEvent.setup();
    renderOwner({ users, selected: [], onChange: () => {} });
    await user.click(screen.getByRole("button", { name: "Owner filter" }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Ben")).toBeInTheDocument();
  });

  it("toggles an owner id through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderOwner({ users, selected: [], onChange });
    await user.click(screen.getByRole("button", { name: "Owner filter" }));
    await user.click(screen.getByRole("checkbox", { name: "Ada" }));
    expect(onChange).toHaveBeenCalledWith(["u1"]);
  });

  it("summarizes the trigger label by count", () => {
    renderOwner({ users, selected: ["u1", "u2"], onChange: () => {} });
    expect(screen.getByText("2 owners")).toBeInTheDocument();
  });
});
