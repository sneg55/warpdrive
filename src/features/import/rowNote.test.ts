import { describe, expect, it } from "vitest";
import { buildRowNoteBody, unmappedHeaders } from "./rowNote";
import type { ResolvedColumnMapping } from "./schemas";

const mapping = (
  columns: ResolvedColumnMapping["columns"],
  rowNoteFromUnmapped = true,
): ResolvedColumnMapping => ({
  dedupMode: "skip",
  options: { rowNoteFromUnmapped },
  columns,
});

describe("unmappedHeaders", () => {
  it("treats an absent column and an explicit do-not-import as unmapped, in CSV order", () => {
    const m = mapping({
      title: { entity: "lead", field: "title", isCustom: false, key: "" },
      posture: { entity: "lead", field: "", isCustom: false, key: "" },
    });
    expect(unmappedHeaders({ title: "a", posture: "b", has_rt: "c" }, m)).toEqual([
      "posture",
      "has_rt",
    ]);
  });

  it("skips cells with no value", () => {
    const m = mapping({});
    expect(unmappedHeaders({ a: "", b: "   ", c: "x" }, m)).toEqual(["c"]);
  });
});

describe("buildRowNoteBody", () => {
  const cols: ResolvedColumnMapping["columns"] = {
    title: { entity: "lead", field: "title", isCustom: false, key: "" },
    summary: { entity: "note", field: "body", isCustom: false, key: "" },
  };
  const raw = {
    title: "NJ Transit",
    summary: "Full Reporter, 3431 VOMs",
    posture: "fails",
    rt: "",
  };

  // One note per row: the mapped Note column first, a blank line, then the columns that would
  // otherwise be silently discarded.
  it("puts the mapped note body first, then the unmapped columns", () => {
    expect(buildRowNoteBody(raw, mapping(cols), "Full Reporter, 3431 VOMs")).toBe(
      "Full Reporter, 3431 VOMs\n\nposture: fails",
    );
  });

  it("emits only the unmapped block when no column maps to the note body", () => {
    const m = mapping({ title: { entity: "lead", field: "title", isCustom: false, key: "" } });
    expect(buildRowNoteBody({ title: "x", posture: "fails", conf: "high" }, m, null)).toBe(
      "posture: fails\nconf: high",
    );
  });

  it("emits only the mapped body when the checkbox is off", () => {
    expect(buildRowNoteBody(raw, mapping(cols, false), "Full Reporter, 3431 VOMs")).toBe(
      "Full Reporter, 3431 VOMs",
    );
  });

  it("returns null when there is nothing to write", () => {
    const m = mapping({ title: { entity: "lead", field: "title", isCustom: false, key: "" } });
    expect(buildRowNoteBody({ title: "x" }, m, null)).toBeNull();
    expect(buildRowNoteBody({ title: "x" }, mapping({}, false), null)).toBeNull();
  });

  it("skips blank cells in the unmapped block", () => {
    const m = mapping({});
    expect(buildRowNoteBody({ a: "1", b: "", c: "3" }, m, null)).toBe("a: 1\nc: 3");
  });
});

// In the storage-backed flow `raw` is loaded from a JSONB column, and Postgres does not preserve
// CSV key order. An explicit header order keeps the note lines in the columns' original order.
describe("explicit header order", () => {
  it("orders unmapped lines by the given headers, not the raw object's key order", () => {
    const m = mapping({});
    // raw's own key order is deliberately scrambled vs the headers.
    const raw = { zeta: "3", alpha: "1", mu: "2" };
    const headers = ["alpha", "mu", "zeta"];
    expect(unmappedHeaders(raw, m, headers)).toEqual(["alpha", "mu", "zeta"]);
    expect(buildRowNoteBody(raw, m, null, headers)).toBe("alpha: 1\nmu: 2\nzeta: 3");
  });

  it("ignores a header with no cell and falls back to raw order when none is given", () => {
    const m = mapping({});
    const raw = { a: "1", b: "2" };
    expect(unmappedHeaders(raw, m, ["a", "missing", "b"])).toEqual(["a", "b"]);
    expect(unmappedHeaders(raw, m)).toEqual(["a", "b"]);
  });
});
