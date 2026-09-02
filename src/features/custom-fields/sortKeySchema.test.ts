import { describe, expect, it } from "vitest";
import { customFieldSortKeySchema } from "./sortKeySchema";

describe("customFieldSortKeySchema", () => {
  it("accepts a cf key and rejects everything else", () => {
    expect(customFieldSortKeySchema.safeParse("cf:region").success).toBe(true);
    expect(customFieldSortKeySchema.safeParse("region").success).toBe(false);
    expect(customFieldSortKeySchema.safeParse("cf:re gion").success).toBe(false);
  });
});
