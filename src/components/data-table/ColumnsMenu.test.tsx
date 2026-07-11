// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnsMenu } from "./ColumnsMenu";
import type { ColumnDef } from "./columnModel";

afterEach(cleanup);

const CATALOG: readonly ColumnDef[] = [
  { key: "title", header: "Title", pinned: true, defaultVisible: true },
  { key: "org", header: "Organization", defaultVisible: true },
  { key: "value", header: "Value", defaultVisible: false },
];

function setup(order: string[]) {
  const onToggle = vi.fn();
  const onReorder = vi.fn();
  render(
    <ColumnsMenu
      catalog={CATALOG}
      order={order}
      visibleKeys={new Set(order)}
      onToggle={onToggle}
      onReorder={onReorder}
    />,
  );
  return { onToggle, onReorder };
}

describe("ColumnsMenu", () => {
  it("lists visible columns and offers hidden ones to re-add", async () => {
    const user = userEvent.setup();
    setup(["title", "org"]);
    await user.click(screen.getByRole("button", { name: "Customize columns" }));
    // Visible columns are shown. The draggable list is loaded via next/dynamic on first open,
    // so it lands a tick after the popover's static content.
    expect(await screen.findByText("Organization")).not.toBeNull();
    // The hidden "Value" column is offered under a Hidden group.
    expect(screen.getByText("Hidden")).not.toBeNull();
    expect(screen.getAllByText("Value").length).toBeGreaterThan(0);
  });

  it("toggles a hidden column on when its checkbox is chosen", async () => {
    const user = userEvent.setup();
    const { onToggle } = setup(["title", "org"]);
    await user.click(screen.getByRole("button", { name: "Customize columns" }));
    await user.click(screen.getByRole("checkbox", { name: "Value" }));
    expect(onToggle).toHaveBeenCalledWith("value");
  });
});
