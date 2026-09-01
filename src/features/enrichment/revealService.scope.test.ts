import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import * as schema from "@/db/schema";
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

describe("revealProspects request scoping", () => {
  it("does not hand a profile another user already revealed and paid for", async () => {
    await kit.connect("apollo");
    const orgId = await kit.seedOrg();
    const other = { ...kit.regular, flags: new Set<PermissionFlagKey>(["contact.create"]) };

    const first = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail));
    expect(first.ok).toBe(true);
    kit.calls.length = 0;

    const second = await kit.reveal(orgId, [profileOf("a")], stubProvider(kit, foundEmail), {
      actor: other,
    });

    expect(second.ok && second.value.items).toEqual([]);
    expect(kit.calls).toEqual([]);
    const rows = await kit.h.db.select().from(schema.prospectReveals);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.requestedBy).toBe(kit.admin.id);
  });
});
