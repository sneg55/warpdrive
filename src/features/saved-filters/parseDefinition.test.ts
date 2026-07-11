import { describe, expect, it } from "vitest";
import { parseSavedFilterDefinition } from "./parseDefinition";

// Saved filters store their definition as jsonb. This parse used to run client-side in
// savedFilterView (dragging zod into the board bundle); it now runs at the server tRPC boundary.
// These cases pin the behavior the client relied on: a valid definition passes through; anything
// malformed collapses to an empty (no-op) filter rather than throwing.
describe("parseSavedFilterDefinition", () => {
  it("passes a valid definition through", () => {
    const def = {
      conditions: [{ field: "value", op: "gt", value: 100 }],
      rotting: true,
    };
    const parsed = parseSavedFilterDefinition(def);
    expect(parsed.conditions).toEqual([{ field: "value", op: "gt", value: 100 }]);
    expect(parsed.rotting).toBe(true);
  });

  it("defaults conditions to an empty array when omitted", () => {
    expect(parseSavedFilterDefinition({}).conditions).toEqual([]);
  });

  it("falls back to an empty filter for a malformed definition", () => {
    expect(parseSavedFilterDefinition({ conditions: "nope" }).conditions).toEqual([]);
    expect(parseSavedFilterDefinition(null).conditions).toEqual([]);
    expect(parseSavedFilterDefinition(42).conditions).toEqual([]);
  });
});
