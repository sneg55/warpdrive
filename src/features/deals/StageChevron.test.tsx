// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accentForOrder, tint } from "./boardStageHeader";
import { StageChevron } from "./StageChevron";

afterEach(cleanup);

function alphaOf(rgba: string): number {
  const m = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(rgba);
  return m === null ? Number.NaN : Number.parseFloat(m[1] ?? "");
}
function rgbPrefix(rgba: string): string {
  const m = /^(rgba\(\d+, \d+, \d+),/.exec(rgba);
  return m?.[1] ?? "";
}

const stages = [
  { id: "s0", name: "Qualified" }, // order 0 -> slate
  { id: "s1", name: "Contact" }, // order 1 -> blue
  { id: "s2", name: "Demo" }, // order 2 -> indigo
];

describe("StageChevron (Add deal stage picker)", () => {
  it("tints each segment in its stage's pipeline hue, not the old primary/muted tokens", () => {
    render(<StageChevron stages={stages} selectedId="s0" onSelect={vi.fn()} />);
    for (const [i, s] of stages.entries()) {
      const seg = screen.getByRole("radio", { name: s.name });
      expect(rgbPrefix(seg.style.backgroundColor)).toBe(rgbPrefix(tint(accentForOrder(i), 1)));
      expect(seg.className).not.toContain("bg-primary");
      expect(seg.className).not.toContain("bg-muted");
    }
  });

  it("emphasizes the selected stage with a deeper fill + bold; others stay light", () => {
    render(<StageChevron stages={stages} selectedId="s1" onSelect={vi.fn()} />);
    const selected = screen.getByRole("radio", { name: "Contact" });
    const other = screen.getByRole("radio", { name: "Demo" });
    expect(alphaOf(selected.style.backgroundColor)).toBeGreaterThan(
      alphaOf(other.style.backgroundColor),
    );
    expect(selected.style.fontWeight).toBe("600");
    expect(other.style.fontWeight).not.toBe("600");
  });

  it("selecting a stage calls onSelect with that stage id", () => {
    const onSelect = vi.fn();
    render(<StageChevron stages={stages} selectedId="s0" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: "Demo" }));
    expect(onSelect).toHaveBeenCalledWith("s2");
  });
});
