import { describe, expect, it } from "vitest";
import { STRINGS } from "@/constants/strings";
import { leadsEmptyState } from "./leadsEmptyState";

describe("leadsEmptyState", () => {
  it("separates an empty inbox from a filter that matched nothing", () => {
    expect(leadsEmptyState({ archived: false, hasFilter: false }).kind).toBe("none");
    expect(leadsEmptyState({ archived: false, hasFilter: true }).kind).toBe("filtered");
  });

  it("names the archive rather than claiming no lead exists", () => {
    const state = leadsEmptyState({ archived: true, hasFilter: false });
    expect(state.kind).toBe("none-archived");
    expect(state.title).toBe(STRINGS.leads.emptyArchivedTitle);
  });

  it("reports a filtered archive as filtered, not as an empty archive", () => {
    expect(leadsEmptyState({ archived: true, hasFilter: true }).kind).toBe("filtered");
  });

  it("states nothing about how many leads exist in the filtered wording", () => {
    const body = leadsEmptyState({ archived: false, hasFilter: true }).body;
    expect(body).not.toMatch(/still (here|holds)|does have|every lead is/i);
  });

  it("gives every state a title and an explaining sentence", () => {
    for (const archived of [true, false]) {
      for (const hasFilter of [true, false]) {
        const state = leadsEmptyState({ archived, hasFilter });
        expect(state.title.length).toBeGreaterThan(0);
        expect(state.body.length).toBeGreaterThan(0);
      }
    }
  });
});
