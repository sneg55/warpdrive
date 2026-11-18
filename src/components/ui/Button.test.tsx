// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonVariants } from "./Button";

describe("Button", () => {
  it("defaults to type=button and fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("type", "button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps its label on one line", () => {
    expect(buttonVariants({})).toContain("whitespace-nowrap");
  });

  it("buttonVariants includes the outline classes for variant=outline", () => {
    expect(buttonVariants({ variant: "outline" })).toContain("border");
  });

  it("default variant uses the emerald action accent, not the slate primary", () => {
    const classes = buttonVariants({ variant: "default" });
    expect(classes).toContain("bg-action");
    expect(classes).toContain("text-action-foreground");
    expect(classes).not.toContain("bg-primary");
  });

  it("filled variants swap to the neutral disabled fill rather than fading out", () => {
    for (const variant of ["default", "destructive"] as const) {
      const classes = buttonVariants({ variant });
      expect(classes).toContain("disabled:bg-disabled");
      expect(classes).toContain("disabled:text-disabled-foreground");
      expect(classes).not.toContain("disabled:opacity-50");
    }
  });

  it("unfilled variants keep the plain fade, which has no fill to misread", () => {
    for (const variant of ["outline", "ghost"] as const) {
      expect(buttonVariants({ variant })).toContain("disabled:opacity-50");
    }
  });
});
