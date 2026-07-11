// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("reflects checked state and toggles on click", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onChange} label="Select row" />);
    const cb = screen.getByRole("checkbox", { name: "Select row" });
    expect(cb).toHaveAttribute("aria-checked", "false");
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders an indeterminate (mixed) state for select-all", () => {
    render(<Checkbox checked="indeterminate" onCheckedChange={vi.fn()} label="Select all" />);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
  });

  it("does not fire onCheckedChange when disabled", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onChange} label="Locked" disabled />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Locked" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
