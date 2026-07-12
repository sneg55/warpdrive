// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { VisibilityControl } from "./VisibilityControl";

// C1: the composer visibility control is now interactive (a shadcn DropdownMenu offering
// Private / Shared), not a read-only label and not a native <select>. It reflects the current
// value and reports a change via onChange so the composer can thread it into the send payload.
describe("VisibilityControl", () => {
  it("shows the shared label when value is shared", () => {
    render(<VisibilityControl value="shared" onChange={vi.fn()} />);
    expect(screen.getByText("Visible to everyone")).toBeInTheDocument();
  });

  it("shows the private label when value is private", () => {
    render(<VisibilityControl value="private" onChange={vi.fn()} />);
    expect(screen.getByText("Private to you")).toBeInTheDocument();
  });

  it("is interactive: opens a menu and reports selecting Private", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<VisibilityControl value="shared" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /visibility/i }));
    await user.click(screen.getByRole("menuitem", { name: /private/i }));
    expect(onChange).toHaveBeenCalledWith("private");
  });

  it("reports selecting Shared when currently private", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<VisibilityControl value="private" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /visibility/i }));
    await user.click(screen.getByRole("menuitem", { name: /everyone|shared/i }));
    expect(onChange).toHaveBeenCalledWith("shared");
  });

  it("uses the shadcn menu, never a native select", () => {
    const { container } = render(<VisibilityControl value="shared" onChange={vi.fn()} />);
    expect(container.querySelector("select")).toBeNull();
  });
});
