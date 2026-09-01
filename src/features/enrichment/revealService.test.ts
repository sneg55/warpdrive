import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PROSPECT_SELECTION_MAX } from "@/constants/prospectSearch";
import * as schema from "@/db/schema";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings } from "./mappingsRepo";
import { insertReveals } from "./prospectsRepo";
import type { ProviderOutcome } from "./providers/types";
import {
  BATCH,
  foundEmail,
  makeRevealKit,
  OTHER_BATCH,
  profileOf,
  type RevealKit,
  SIG,
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

describe("revealProspects", () => {
  it("rejects a chunk larger than one reveal batch allows", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(
      orgId,
      ["a", "b", "c", "d", "e", "f"].map((r) => profileOf(r)),
      stubProvider(kit, foundEmail),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.id).toBe("E_ENRICH_007");
    expect(kit.calls).toEqual([]);
  });

  it("denies an actor without contact.create and calls no provider", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail), {
      actor: kit.regular,
    });

    expect(result.ok ? null : result.error.id).toBe("E_PERM_001");
    expect(kit.calls).toEqual([]);
    expect(await kit.h.db.select().from(schema.prospectReveals)).toEqual([]);
  });

  it("hands every provider a lookup carrying the linkedin url, name and bare company domain", async () => {
    await kit.connect("apollo");
    await kit.connect("rocketreach");
    const orgId = await kit.seedOrg();

    await kit.reveal(
      orgId,
      [profileOf("a", { firstName: "Ada", lastName: "Lovelace" })],
      stubProvider(kit, foundEmail),
    );

    expect(kit.calls).toHaveLength(2);
    for (const call of kit.calls) {
      expect(call.lookup.linkedinUrl).toBe("https://linkedin.com/in/ada");
      expect(call.lookup.fullName).toBe("Ada Lovelace");
      expect(call.lookup.firstName).toBe("Ada");
      expect(call.lookup.lastName).toBe("Lovelace");
      expect(call.lookup.companyName).toBe("Acme Incorporated");
      expect(call.lookup.companyDomain).toBe("acme.com");
    }
  });

  it("passes the provider ref only to the provider the search ran against", async () => {
    await kit.connect("apollo");
    await kit.connect("rocketreach");
    const orgId = await kit.seedOrg();

    await kit.reveal(orgId, [profileOf("ref-1")], stubProvider(kit, foundEmail), {
      searchProvider: "rocketreach",
    });

    const byProvider = new Map(kit.calls.map((c) => [c.provider, c.lookup]));
    expect(byProvider.get("rocketreach")?.providerRef).toBe("ref-1");
    expect(byProvider.get("apollo")?.providerRef).toBeUndefined();
  });

  it("writes one reveal row per profile holding normalised outcomes and no raw payload", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    const raw = {
      provider: "apollo",
      kind: "ok",
      candidate: { fields: { "person.email": "ada@acme.com" } },
      rawBody: { unlocked_email: "ada@acme.com", token: "leaky" },
    } as unknown as ProviderOutcome;

    const result = await kit.reveal(
      orgId,
      [profileOf("a"), profileOf("b")],
      stubProvider(kit, () => raw),
    );

    expect(result.ok && result.value.items.map((r) => r.providerRef).sort()).toEqual(["a", "b"]);
    const rows = await kit.h.db.select().from(schema.prospectReveals);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.batchId === BATCH && r.orgId === orgId)).toBe(true);
    expect(rows[0]?.outcomes[0]?.candidate?.fields).toEqual({ "person.email": "ada@acme.com" });
    expect(JSON.stringify(rows.map((r) => r.outcomes))).not.toContain("leaky");
  });

  it("returns the merged fields the enrich dialog renders", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail));

    const fields = result.ok ? (result.value.items[0]?.fields ?? []) : [];
    const email = fields.find((f) => f.canonicalKey === "person.email");
    expect(email?.selectedValue).toBe("ada@acme.com");
    expect(email?.currentValue).toBeNull();
  });

  it("carries the mapping fingerprint the fields were merged against", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail));

    const expected = mappingsFingerprint(await listMappings(kit.h.db, "person", SIG()));
    expect(expected.length).toBeGreaterThan(0);
    expect(result.ok ? result.value.mappingsFingerprint : null).toBe(expected);
    expect(result.ok ? result.value.items.map((r) => r.providerRef) : []).toEqual(["a"]);
    expect(result.ok ? result.value.failures : null).toEqual([]);
  });

  it("leaves the other profiles revealed and persisted when one profile's provider throws", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(
      orgId,
      [profileOf("a"), profileOf("bad", { fullName: "Broken One" }), profileOf("c")],
      stubProvider(kit, (id, lookup) => {
        if (lookup.fullName === "Broken One") throw new Error("provider exploded");
        return foundEmail(id);
      }),
    );

    const revealed = result.ok ? result.value.items : [];
    const good = revealed.filter((r) => r.fields.length > 0).map((r) => r.providerRef);
    expect(good.sort()).toEqual(["a", "c"]);
    const rows = await kit.h.db.select().from(schema.prospectReveals);
    expect(rows.map((r) => r.providerRef).sort()).toEqual(["a", "bad", "c"]);
    const broken = rows.find((r) => r.providerRef === "bad");
    expect(broken?.outcomes[0]?.kind).toBe("provider_error");
  });

  it("replays a provider ref already revealed in the batch without inserting or calling again", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    const first = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail));
    expect(first.ok).toBe(true);
    kit.calls.length = 0;

    const second = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail));

    expect(kit.calls).toEqual([]);
    expect(await kit.h.db.select().from(schema.prospectReveals)).toHaveLength(1);
    const fields = second.ok ? (second.value.items[0]?.fields ?? []) : [];
    expect(fields.find((f) => f.canonicalKey === "person.email")?.selectedValue).toBe(
      "ada@acme.com",
    );
  });

  it("refuses a chunk that would push the batch past the selection cap", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    await insertReveals(
      kit.h.db,
      Array.from({ length: PROSPECT_SELECTION_MAX }, (_, i) => ({
        batchId: BATCH,
        orgId,
        requestedBy: kit.admin.id,
        providerRef: `seeded-${i}`,
        searchProvider: "apollo" as const,
        profile: profileOf(`seeded-${i}`),
        outcomes: [],
      })),
      SIG(),
    );

    const result = await kit.reveal(orgId, [profileOf("extra")], stubProvider(kit, foundEmail));

    expect(result.ok ? null : result.error.id).toBe("E_ENRICH_018");
    expect(kit.calls).toEqual([]);
  });

  it("spends nothing and persists nothing when no provider is usable", async () => {
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail), {
      batchId: OTHER_BATCH,
    });

    expect(result.ok ? null : result.error.id).toBe("E_ENRICH_001");
    expect(await kit.h.db.select().from(schema.prospectReveals)).toEqual([]);
  });

  it("asks only the searching provider when the surname it found is obfuscated", async () => {
    await kit.connect("apollo");
    await kit.connect("getprospect");
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(
      orgId,
      [profileOf("a", { fullName: "Manish Ma***i", linkedinUrl: undefined })],
      stubProvider(kit, foundEmail),
      { searchProvider: "apollo" },
    );

    expect(result.ok).toBe(true);
    expect(kit.calls.map((c) => c.provider)).toEqual(["apollo"]);
    expect(kit.calls[0]?.lookup.providerRef).toBe("a");
  });

  it("still asks every connected provider when the surname is a real one", async () => {
    await kit.connect("apollo");
    await kit.connect("getprospect");
    const orgId = await kit.seedOrg();

    await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail), {
      searchProvider: "apollo",
    });

    expect([...kit.calls.map((c) => c.provider)].sort()).toEqual(["apollo", "getprospect"]);
  });

  it("fails a masked profile rather than banking an empty reveal when its provider is gone", async () => {
    await kit.connect("getprospect");
    const orgId = await kit.seedOrg();

    const result = await kit.reveal(
      orgId,
      [profileOf("a", { fullName: "Manish Ma***i", linkedinUrl: undefined })],
      stubProvider(kit, foundEmail),
      { searchProvider: "apollo" },
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.failures : []).toEqual([
      { providerRef: "a", errorId: "E_ENRICH_001" },
    ]);
    expect(kit.calls).toEqual([]);
    expect(await kit.h.db.select().from(schema.prospectReveals)).toEqual([]);
  });
});
