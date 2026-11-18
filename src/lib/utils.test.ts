import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
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
