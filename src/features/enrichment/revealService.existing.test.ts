import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  foundEmail,
  makeRevealKit,
  profileOf,
  type RevealKit,
  stubProvider,
} from "./revealService.test-helpers";

let kit: RevealKit;

beforeAll(async () => {
  kit = await makeRevealKit();
});
afterAll(async () => {
  await kit.h.close();
});
beforeEach(async () => {
  await kit.reset();
});

describe("revealProspects against a person Warpdrive already holds", () => {
  it("merges the profile against that person's current values", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    const person = await kit.seedPerson(orgId, {
      name: "Ada Lovelace",
      firstName: "Adah",
      primaryEmail: "ada@acme.com",
    });

    const result = await kit.reveal(
      orgId,
      [profileOf("a")],
      stubProvider(kit, (id) => ({
        provider: id,
        kind: "ok",
        candidate: { fields: { "person.email": "ada@acme.com", "person.firstName": "Ada" } },
      })),
    );

    const item = result.ok ? result.value.items[0] : undefined;
    expect(item?.match).toEqual({
      kind: "existing",
      personId: person.id,
      personUpdatedAtIso: person.updatedAtIso,
    });
    expect(item?.fields.find((f) => f.canonicalKey === "person.email")).toBeUndefined();
    const first = item?.fields.find((f) => f.canonicalKey === "person.firstName");
    expect(first?.currentValue).toBe("Adah");
    expect(first?.isOverwrite).toBe(true);
    expect(first?.defaultSelected).toBe(false);
  });

  it("reports a profile with no match as new and merges it against nothing", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    await kit.seedPerson(orgId, { name: "Grace Hopper", primaryEmail: "grace@acme.com" });

    const result = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail));

    const item = result.ok ? result.value.items[0] : undefined;
    expect(item?.match).toEqual({ kind: "new" });
    expect(item?.fields.find((f) => f.canonicalKey === "person.email")?.currentValue).toBeNull();
  });
});
