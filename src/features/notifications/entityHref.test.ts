import { describe, expect, it } from "vitest";
import { ENTITY_TYPES } from "@/constants/entityTypes";
import { entityHref } from "./entityHref";

describe("entityHref", () => {
  it("maps every entity type a notification can carry to its real route", () => {
    expect(entityHref("deal", "d1")).toBe("/deals/d1");
    expect(entityHref("person", "p1")).toBe("/contacts/people/p1");
    expect(entityHref("organization", "o1")).toBe("/contacts/orgs/o1");
    expect(entityHref("lead", "l1")).toBe("/leads/l1");
  });

  it("covers all of ENTITY_TYPES, so a new entity type cannot silently lose its link", () => {
    for (const t of ENTITY_TYPES) {
      expect(entityHref(t, "x1"), `no route for entity type ${t}`).not.toBeNull();
    }
  });

  it("returns null for a ref with no detail route instead of inventing one", () => {
    // Activities and email messages have no detail page. The old email renderer pluralized the
    // entity type into `/activitys/<id>`, which 404s.
    expect(entityHref("activity", "a1")).toBeNull();
    expect(entityHref("email_message", "m1")).toBeNull();
  });

  it("returns null when either half of the ref is missing", () => {
    expect(entityHref(null, "d1")).toBeNull();
    expect(entityHref("deal", null)).toBeNull();
    expect(entityHref(null, null)).toBeNull();
  });
});
