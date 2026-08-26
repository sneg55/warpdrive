import { describe, expect, it } from "vitest";
import { STRINGS } from "@/constants/strings";
import { leadsEmptyState } from "./leadsEmptyState";

describe("leadsEmptyState", () => {
  // "Nothing here yet" and "your filter excluded everything" are different facts and need
  // different exits: one adds a lead, the other clears the filter.
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

  // The inbox reads its counts through the filter, so it cannot tell "the filter hid your leads"
  // from "you have no leads and a filter happens to be on". The wording has to hold in both, and
  // it used to open by stating that every lead is still there.
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
