import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  // text-display is a project font size, not one tailwind-merge ships with. Left unregistered it
  // reads as a text COLOUR, so a later text-foreground wins and the size vanishes with no error.
  it("keeps the display size when a colour follows it", () => {
    expect(cn("text-display font-semibold text-foreground")).toContain("text-display");
  });

  it("lets the display size override an earlier size", () => {
    const merged = cn("text-sm", "text-display");
    expect(merged).toContain("text-display");
    expect(merged).not.toContain("text-sm");
  });

  it("still resolves a stock size conflict", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });
});
