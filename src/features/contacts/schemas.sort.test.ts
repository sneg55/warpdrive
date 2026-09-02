import { describe, expect, it } from "vitest";
import { orgSortInput, personSortInput } from "./schemas";

describe("contact sort inputs", () => {
  it("accept built-in and cf: fields, reject others", () => {
    expect(personSortInput.safeParse({ field: "cf:region", dir: "asc" }).success).toBe(true);
    expect(personSortInput.safeParse({ field: "name", dir: "asc" }).success).toBe(true);
    expect(personSortInput.safeParse({ field: "region", dir: "asc" }).success).toBe(false);
    expect(orgSortInput.safeParse({ field: "cf:size", dir: "desc" }).success).toBe(true);
    expect(orgSortInput.safeParse({ field: "cf:Bad Key", dir: "desc" }).success).toBe(false);
  });
});
