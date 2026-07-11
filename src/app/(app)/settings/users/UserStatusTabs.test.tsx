// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserStatusTabs } from "./UserStatusTabs";

afterEach(cleanup);

describe("UserStatusTabs", () => {
  it("renders All / Active / Invited / Deactivated", () => {
    render(<UserStatusTabs value="all" onChange={() => {}} />);
    for (const name of ["All", "Active", "Invited", "Deactivated"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks the active tab pressed", () => {
    render(<UserStatusTabs value="invited" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Invited" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the clicked status", () => {
    const onChange = vi.fn();
    render(<UserStatusTabs value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivated" }));
    expect(onChange).toHaveBeenCalledWith("deactivated");
  });
});
