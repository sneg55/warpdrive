// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("reflects checked state and toggles on click", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} label="Track opens" />);
    const sw = screen.getByRole("switch", { name: "Track opens" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("provides shared hover feedback without animating disabled switches", () => {
    const { getByRole, rerender } = render(
      <Switch checked={false} onCheckedChange={vi.fn()} label="Hover preference" />,
    );
    const sw = getByRole("switch", { name: "Hover preference" });

    expect(sw).toHaveClass("hover:not-disabled:ring-4");
    expect(sw).toHaveClass("data-[state=unchecked]:hover:not-disabled:bg-muted-foreground/40");
    expect(sw).toHaveClass("motion-safe:active:not-disabled:scale-[0.96]");

    rerender(<Switch checked disabled onCheckedChange={vi.fn()} label="Hover preference" />);
    expect(sw).toBeDisabled();
    expect(sw).toHaveClass("data-[state=checked]:hover:not-disabled:bg-success/85");
  });
});
