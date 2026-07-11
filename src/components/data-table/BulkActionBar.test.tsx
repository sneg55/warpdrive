// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

afterEach(() => {
  cleanup();
});

describe("BulkActionBar", () => {
  it("shows the count, renders action children, and clears", () => {
    const onClear = vi.fn();
    render(
      <BulkActionBar count={3} onClear={onClear}>
        <button type="button">Delete</button>
      </BulkActionBar>,
    );
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
