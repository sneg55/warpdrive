import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type {
  EnrichmentProvider,
  PersonLookup,
  ProviderId,
  ProviderOutcome,
} from "./providers/types";
import { makeRevealKit, profileOf, type RevealKit } from "./revealService.test-helpers";

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

function slowProvider(revealKit: RevealKit): (id: ProviderId) => EnrichmentProvider {
  return (id) => ({
    id,
    matchPerson: async (lookup: PersonLookup) => {
      revealKit.calls.push({ provider: id, lookup });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const outcome: ProviderOutcome = {
        provider: id,
        kind: "ok",
        candidate: { fields: { "person.email": "ada@acme.com" } },
      };
      return outcome;
    },
    matchOrganization: () => Promise.resolve({ provider: id, kind: "no_match" as const }),
  });
}

describe("revealProspects concurrency", () => {
  it("calls the provider exactly once for two concurrent reveals of the same profile", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();

    const [first, second] = await Promise.all([
      kit.reveal(orgId, [profileOf("a")], slowProvider(kit)),
      kit.reveal(orgId, [profileOf("a")], slowProvider(kit)),
    ]);

    expect(kit.calls).toHaveLength(1);
    const rows = await kit.h.db.select().from(schema.prospectReveals);
    expect(rows).toHaveLength(1);
    for (const result of [first, second]) {
      expect(result.ok).toBe(true);
      const fields = result.ok ? result.value.items[0]?.fields : [];
      expect(fields?.find((f) => f.canonicalKey === "person.email")?.selectedValue).toBe(
        "ada@acme.com",
      );
    }
  });

  it("completes when concurrent reveals occupy every connection in the pool", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    const refs = ["a", "b", "c", "d", "e", "f"];

    const results = await Promise.all(
      refs.map((ref) => kit.reveal(orgId, [profileOf(ref)], slowProvider(kit))),
    );

    for (const result of results) {
      expect(result.ok).toBe(true);
    }
    const rows = await kit.h.db.select().from(schema.prospectReveals);
    expect(rows).toHaveLength(refs.length);
  }, 20_000);
});
