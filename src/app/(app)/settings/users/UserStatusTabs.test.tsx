// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserStatusTabs } from "./UserStatusTabs";

afterEach(cleanup);

describe("UserStatusTabs", () => {
  it("renders the filters as a named toggle-button group", () => {
    render(<UserStatusTabs value="all" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "User status filter" })).toBeInTheDocument();
    for (const name of ["All", "Active", "Invited", "Deactivated"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks the active filter pressed without dangling tab-panel references", () => {
    render(<UserStatusTabs value="invited" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Invited" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Invited" })).not.toHaveAttribute("aria-controls");
  });

  it("reports the clicked status", async () => {
    const onChange = vi.fn();
    render(<UserStatusTabs value="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Deactivated" }));
    expect(onChange).toHaveBeenCalledWith("deactivated");
  });
});
