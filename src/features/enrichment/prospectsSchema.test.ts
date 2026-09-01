import { describe, expect, it } from "vitest";
import { prospectReveals } from "@/db/schema";

describe("prospect_reveals schema", () => {
  it("exposes the columns the reveal flow writes", () => {
    expect(Object.keys(prospectReveals)).toEqual(
      expect.arrayContaining([
        "id",
        "batchId",
        "orgId",
        "requestedBy",
        "providerRef",
        "searchProvider",
        "profile",
        "outcomes",
        "personId",
        "appliedAt",
        "createdAt",
      ]),
    );
  });
});
