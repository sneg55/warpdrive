import { describe, expect, it } from "vitest";
import { normalizeDealSidebarSections } from "./dealSidebarSections";

describe("normalizeDealSidebarSections", () => {
  it("keeps Summary visible even when a persisted preference tries to hide it", () => {
    const out = normalizeDealSidebarSections([
      { id: "summary", visible: false },
      { id: "source", visible: false },
    ]);
    const summary = out.find((s) => s.id === "summary");
    expect(summary?.visible).toBe(true);
    expect(out.find((s) => s.id === "source")?.visible).toBe(false);
  });

  it("preserves order and fills missing sections with visible defaults", () => {
    const out = normalizeDealSidebarSections([{ id: "source", visible: true }]);
    expect(out[0]?.id).toBe("source");
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
  });
});
