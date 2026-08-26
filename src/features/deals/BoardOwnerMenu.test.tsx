// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardOwnerMenu } from "./BoardOwnerMenu";

afterEach(cleanup);

const owners = [
  { ownerId: "u1", name: "Ada King" },
  { ownerId: "u2", name: "Bob Lee" },
];

function renderMenu(props: Partial<React.ComponentProps<typeof BoardOwnerMenu>> = {}) {
  return render(
    <BoardOwnerMenu owners={owners} selectedOwnerId={null} onSelectOwner={() => {}} {...props} />,
  );
}

describe("BoardOwnerMenu", () => {
  it("shows Everyone as the trigger label by default", () => {
    renderMenu();
    expect(screen.getByRole("button", { name: /Everyone/ })).not.toBeNull();
  });

  it("shows the selected owner's name as the trigger label", () => {
    renderMenu({ selectedOwnerId: "u2" });
    expect(screen.getByRole("button", { name: /Bob Lee/ })).not.toBeNull();
  });

  it("lists the board owners", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByText("Ada King")).not.toBeNull();
    expect(screen.getByText("Bob Lee")).not.toBeNull();
  });

  it("carries no filter tabs, so saved filters are not hidden behind the owner label", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByText("All open deals")).toBeNull();
  });

  it("closes the popover when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByPlaceholderText("Search owner")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Search owner")).toBeNull();
  });

  it("reports the chosen owner", async () => {
    const user = userEvent.setup();
    const onSelectOwner = vi.fn();
    renderMenu({ onSelectOwner });
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.click(screen.getByText("Bob Lee"));
    expect(onSelectOwner).toHaveBeenCalledWith("u2");
  });

  it("reports Everyone as a cleared owner", async () => {
    const user = userEvent.setup();
    const onSelectOwner = vi.fn();
    renderMenu({ selectedOwnerId: "u2", onSelectOwner });
    await user.click(screen.getByRole("button", { name: /Bob Lee/ }));
    // The trigger reads "Owner: Bob Lee" here, so the only "Everyone" button is the row.
    fireEvent.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(onSelectOwner).toHaveBeenCalledWith(null);
  });

  it("filters the owner list via the search box", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.change(screen.getByPlaceholderText("Search owner"), { target: { value: "bob" } });
    expect(screen.queryByText("Ada King")).toBeNull();
    expect(screen.getByText("Bob Lee")).not.toBeNull();
  });

  it("marks the signed-in user's row", async () => {
    const user = userEvent.setup();
    renderMenu({ currentUserId: "u1" });
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByText("(my)")).not.toBeNull();
  });
});
