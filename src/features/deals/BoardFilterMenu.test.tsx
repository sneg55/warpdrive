// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardFilterMenu } from "./BoardFilterMenu";

afterEach(cleanup);

const owners = [
  { ownerId: "u1", name: "Ada King" },
  { ownerId: "u2", name: "Bob Lee" },
];

function renderMenu(props: Partial<React.ComponentProps<typeof BoardFilterMenu>> = {}) {
  return render(
    <BoardFilterMenu owners={owners} selectedOwnerId={null} onSelectOwner={() => {}} {...props} />,
  );
}

describe("BoardFilterMenu", () => {
  it("shows Everyone as the trigger label by default", () => {
    renderMenu();
    expect(screen.getByRole("button", { name: /Everyone/ })).not.toBeNull();
  });

  it("shows the selected owner's name as the trigger label", () => {
    renderMenu({ selectedOwnerId: "u2" });
    expect(screen.getByRole("button", { name: /Bob Lee/ })).not.toBeNull();
  });

  it("opens the three tabs and lists board owners", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByRole("tab", { name: "Favorites" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Owners" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Filters" })).not.toBeNull();
    expect(screen.getByText("Ada King")).not.toBeNull();
    expect(screen.getByText("Bob Lee")).not.toBeNull();
  });

  it("wires the trigger open/closed state via the Radix Popover", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: /Everyone/ });
    // Radix stamps data-state on the trigger; the hand-rolled shell did not.
    expect(trigger.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByPlaceholderText("Search owner or filter")).toBeNull();
    await user.click(trigger);
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.getByPlaceholderText("Search owner or filter")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Owners" })).not.toBeNull();
  });

  it("closes the popover when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByPlaceholderText("Search owner or filter")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Search owner or filter")).toBeNull();
  });

  it("reports the chosen owner", async () => {
    const user = userEvent.setup();
    const onSelectOwner = vi.fn();
    renderMenu({ onSelectOwner });
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.click(screen.getByText("Bob Lee"));
    expect(onSelectOwner).toHaveBeenCalledWith("u2");
  });

  it("filters the owner list via the search box", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.change(screen.getByPlaceholderText("Search owner or filter"), {
      target: { value: "bob" },
    });
    expect(screen.queryByText("Ada King")).toBeNull();
    expect(screen.getByText("Bob Lee")).not.toBeNull();
  });

  it("marks 'All open deals' selected when no owner or saved filter is active", async () => {
    const user = userEvent.setup();
    renderMenu({ selectedOwnerId: null, selectedFilterId: null });
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    await user.click(screen.getByRole("tab", { name: "Filters" }));
    const row = screen.getByRole("button", { name: "All open deals" });
    expect(row.className).toContain("font-medium");
  });

  it("resets owner and saved filter when 'All open deals' is clicked", async () => {
    const onSelectOwner = vi.fn();
    const onSelectFilter = vi.fn();
    const user = userEvent.setup();
    renderMenu({ selectedOwnerId: "u2", onSelectOwner, onSelectFilter });
    await user.click(screen.getByRole("button", { name: /Bob Lee/ }));
    await user.click(screen.getByRole("tab", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "All open deals" }));
    expect(onSelectOwner).toHaveBeenCalledWith(null);
    expect(onSelectFilter).toHaveBeenCalledWith(null);
  });

  it("invokes onCreateFilter from the Filters tab", async () => {
    const onCreateFilter = vi.fn();
    const user = userEvent.setup();
    renderMenu({ onCreateFilter });
    await user.click(screen.getByRole("button", { name: /Everyone/ }));
    await user.click(screen.getByRole("tab", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new filter" }));
    expect(onCreateFilter).toHaveBeenCalledTimes(1);
  });
});
