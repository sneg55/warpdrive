// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ColumnMenu } from "./ColumnMenu";

afterEach(cleanup);

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Customize columns" }));
}

describe("ColumnMenu", () => {
  const props = {
    order: ["title", "owner", "value"] as string[],
    visibleKeys: new Set(["title", "owner", "value"]),
    onToggle: () => {},
    onReorder: () => {},
  };

  it("renders visible columns in stored order with drag handles (except pinned Title)", async () => {
    const user = userEvent.setup();
    render(<ColumnMenu {...props} />);
    await open(user);
    // The draggable list loads via next/dynamic on first open. Await it BEFORE asserting the
    // pinned column has no handle, otherwise that absence would hold vacuously.
    expect(await screen.findByRole("button", { name: "Reorder Owner" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Value" })).toBeInTheDocument();
    // Title is pinned: no reorder handle.
    expect(screen.queryByRole("button", { name: "Reorder Title" })).toBeNull();
  });

  it("disables the pinned Title checkbox and checks visible columns", async () => {
    const user = userEvent.setup();
    render(<ColumnMenu {...props} />);
    await open(user);
    // Pinned Title lives in the dynamically loaded list.
    const title = await screen.findByRole("checkbox", { name: "Title" });
    expect(title).toBeDisabled();
    expect(title).toBeChecked();
  });

  it("lists hidden columns as unchecked static rows", async () => {
    const user = userEvent.setup();
    render(<ColumnMenu {...props} />);
    await open(user);
    // "Labels" is not in order -> hidden, unchecked, and has no reorder handle.
    const labels = screen.getByRole("checkbox", { name: "Labels" });
    expect(labels).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Reorder Labels" })).toBeNull();
  });
});
