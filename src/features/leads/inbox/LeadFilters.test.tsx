// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    labels: {
      listByTarget: {
        useQuery: () => ({
          data: [{ id: "l1", target: "lead", name: "Hot", color: "red", order: 0 }],
        }),
      },
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
