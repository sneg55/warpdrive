// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnsMenu } from "./ColumnsMenu";
import "./ColumnsMenuSortableList";
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
    expect(await screen.findByText("Organization")).not.toBeNull();
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

  it("bounds the popover content height so many hidden entries stay scrollable", async () => {
    const user = userEvent.setup();
    setup(["title", "org"]);
    await user.click(screen.getByRole("button", { name: "Customize columns" }));
    const content = await screen.findByRole("dialog");
    expect(content).toHaveClass("overflow-y-auto");
  });
});
