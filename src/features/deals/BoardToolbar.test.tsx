// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/pipeline",
}));

import { BoardToolbar } from "./BoardToolbar";

afterEach(cleanup);

function renderToolbar(activeView?: "board" | "list" | "archived") {
  return render(
    <BoardToolbar
      pipelineId="p1"
      pipelines={[{ id: "p1", name: "Sales" }]}
      totalValue="1000"
      dealCount={2}
      activeView={activeView}
    />,
  );
}

describe("BoardToolbar view toggle", () => {
  it("renders Board and List as icon buttons (Pipedrive), with accessible names", () => {
    renderToolbar();
    const board = screen.getByRole("link", { name: "Board view" });
    const list = screen.getByRole("link", { name: "List view" });
    // Each control carries an icon glyph, not just a text label.
    expect(board.querySelector("svg")).not.toBeNull();
    expect(list.querySelector("svg")).not.toBeNull();
    // The active view is marked for assistive tech.
    expect(board.getAttribute("aria-current")).toBe("page");
  });

  it("shows a visible text label on each segment so List/Archive are discoverable (P6)", () => {
    renderToolbar();
    expect(screen.getByRole("link", { name: "Board view" }).textContent).toContain("Board");
    expect(screen.getByRole("link", { name: "List view" }).textContent).toContain("List");
    expect(screen.getByRole("link", { name: "Archive view" }).textContent).toContain("Archive");
  });

  it("links to the Edit Pipeline page from a pencil control", () => {
    renderToolbar();
    const edit = screen.getByRole("link", { name: "Edit pipeline" });
    expect(edit.getAttribute("href")).toBe("/pipeline/p1/edit");
    expect(edit.querySelector("svg")).not.toBeNull();
  });

  it("defaults to the Board tab being current", () => {
    renderToolbar();
    expect(screen.getByRole("link", { name: "Board view" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "List view" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks the List tab current (and not Board) when the list view is active", () => {
    renderToolbar("list");
    expect(screen.getByRole("link", { name: "List view" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Board view" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks the Archive tab current when the archived view is active", () => {
    renderToolbar("archived");
    expect(screen.getByRole("link", { name: "Archive view" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Board view" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("keeps the full board summary and pipeline controls on the list/archive views (parity)", () => {
    renderToolbar("list");
    // The list view must show the same deal count + pipeline selector + edit control as the board,
    // so the toolbar does not shift when switching views.
    expect(screen.getByRole("link", { name: "Edit pipeline" })).not.toBeNull();
    expect(screen.getByText(/deal/i)).not.toBeNull();
  });
});
