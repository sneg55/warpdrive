// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("opens the three tabs and lists board owners", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Everyone/ }));
    expect(screen.getByRole("tab", { name: "Favorites" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Owners" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Filters" })).not.toBeNull();
    expect(screen.getByText("Ada King")).not.toBeNull();
    expect(screen.getByText("Bob Lee")).not.toBeNull();
  });

  it("reports the chosen owner", () => {
    const onSelectOwner = vi.fn();
    renderMenu({ onSelectOwner });
    fireEvent.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.click(screen.getByText("Bob Lee"));
    expect(onSelectOwner).toHaveBeenCalledWith("u2");
  });

  it("filters the owner list via the search box", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.change(screen.getByPlaceholderText("Search owner or filter"), {
      target: { value: "bob" },
    });
    expect(screen.queryByText("Ada King")).toBeNull();
    expect(screen.getByText("Bob Lee")).not.toBeNull();
  });

  it("marks 'All open deals' selected when no owner or saved filter is active", () => {
    renderMenu({ selectedOwnerId: null, selectedFilterId: null });
    fireEvent.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
    const row = screen.getByRole("button", { name: "All open deals" });
    expect(row.className).toContain("font-medium");
  });

  it("resets owner and saved filter when 'All open deals' is clicked", () => {
    const onSelectOwner = vi.fn();
    const onSelectFilter = vi.fn();
    renderMenu({ selectedOwnerId: "u2", onSelectOwner, onSelectFilter });
    fireEvent.click(screen.getByRole("button", { name: /Bob Lee/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "All open deals" }));
    expect(onSelectOwner).toHaveBeenCalledWith(null);
    expect(onSelectFilter).toHaveBeenCalledWith(null);
  });

  it("invokes onCreateFilter from the Filters tab", () => {
    const onCreateFilter = vi.fn();
    renderMenu({ onCreateFilter });
    fireEvent.click(screen.getByRole("button", { name: /Everyone/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new filter" }));
    expect(onCreateFilter).toHaveBeenCalledTimes(1);
  });
});
