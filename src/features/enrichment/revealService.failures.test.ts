import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { insertReveals } from "./prospectsRepo";
import {
  BATCH,
  foundEmail,
  makeRevealKit,
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

describe("revealProspects when a reveal does not survive persistence", () => {
  it("reports the profile as a failure rather than counting it as revealed", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    const otherOrgId = await kit.seedOrg();
    await insertReveals(
      kit.h.db,
      [
        {
          batchId: BATCH,
          orgId: otherOrgId,
          requestedBy: kit.admin.id,
          providerRef: "b",
          searchProvider: "apollo" as const,
          profile: profileOf("b"),
          outcomes: [],
        },
      ],
      SIG(),
    );

    const result = await kit.reveal(
      orgId,
      [profileOf("a"), profileOf("b")],
      stubProvider(kit, foundEmail),
    );

    expect(kit.calls.map((c) => c.provider)).toHaveLength(1);
    expect(result.ok ? result.value.items.map((r) => r.providerRef) : []).toEqual(["a"]);
    expect(result.ok ? result.value.failures : []).toEqual([
      { providerRef: "b", errorId: "E_ENRICH_017" },
    ]);
    const rows = await kit.h.db.select().from(schema.prospectReveals);
    expect(rows.filter((r) => r.orgId === orgId).map((r) => r.providerRef)).toEqual(["a"]);
  });
});
