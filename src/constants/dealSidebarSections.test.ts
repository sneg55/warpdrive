import { describe, expect, it } from "vitest";
import { normalizeDealSidebarSections } from "./dealSidebarSections";

describe("normalizeDealSidebarSections", () => {
  it("keeps Summary visible even when a persisted preference tries to hide it", () => {
    // Summary hosts the only "Manage sidebar sections" trigger, so hiding it would make the
    // manager (and every hidden section) unreachable. Summary is therefore non-hideable.
    const out = normalizeDealSidebarSections([
      { id: "summary", visible: false },
      { id: "source", visible: false },
    ]);
    const summary = out.find((s) => s.id === "summary");
    expect(summary?.visible).toBe(true);
    // A non-Summary section may still be hidden.
    expect(out.find((s) => s.id === "source")?.visible).toBe(false);
  });

  it("preserves order and fills missing sections with visible defaults", () => {
    const out = normalizeDealSidebarSections([{ id: "source", visible: true }]);
    expect(out[0]?.id).toBe("source");
    // every known section present exactly once
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
  });
});
