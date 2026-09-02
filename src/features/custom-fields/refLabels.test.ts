import { describe, expect, it, vi } from "vitest";
import { organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import type { CustomFieldDef } from "@/types/customFields";
import { createDef } from "./defsRepo";
import {
  attachRefLabels,
  mergeRefLabels,
  resolveCustomFieldRefLabels,
  resolveCustomFieldRefLabelsFor,
} from "./refLabels";

const sig = () => new AbortController().signal;
function regular(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}
function manager(id: string, managedUserIds: readonly string[]): AuthUser {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    managedUserIds: new Set(managedUserIds),
  };
}

describe("resolveCustomFieldRefLabels", () => {
  it("labels users, visible persons and orgs, and omits hidden or deleted ones", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, { name: "Me" });
      const other = await seedUser(db, { name: "Other" });
      const rep = await createDef(db, { targetEntity: "deal", type: "user", name: "Rep" }, sig());
      const champ = await createDef(
        db,
        { targetEntity: "deal", type: "person", name: "Champion" },
        sig(),
      );
      const partner = await createDef(
        db,
        { targetEntity: "deal", type: "org", name: "Partner" },
        sig(),
      );
      if (!rep.ok) throw rep.error;
      if (!champ.ok) throw champ.error;
      if (!partner.ok) throw partner.error;
      const [pub] = await db
        .insert(persons)
        .values({ name: "Pub", ownerId: other.id, visibilityLevel: "all", customFields: {} })
        .returning();
      const [hidden] = await db
        .insert(persons)
        .values({ name: "Hidden", ownerId: other.id, visibilityLevel: "owner", customFields: {} })
        .returning();
      const [org] = await db
        .insert(organizations)
        .values({ name: "Acme", ownerId: me.id, visibilityLevel: "owner", customFields: {} })
        .returning();
      if (!pub || !hidden || !org) throw new Error("seed failed");

      const labels = await resolveCustomFieldRefLabels(
        db,
        regular(me.id),
        [rep.value, champ.value, partner.value],
        [
          { customFields: { rep: other.id, champion: pub.id, partner: org.id } },
          { customFields: { champion: hidden.id } },
        ],
        sig(),
      );
      expect(labels.user[other.id]).toBe("Other");
      expect(labels.person[pub.id]).toBe("Pub");
      expect(labels.person[hidden.id]).toBeUndefined();
      expect(labels.org[org.id]).toBe("Acme");
    });
  });

  it("does not grant a team manager visibility into a subordinate's owner-only person or org label (contact-route actor parity)", async () => {
    await withTestDb(async (db) => {
      const boss = await seedUser(db, { name: "Boss" });
      const report = await seedUser(db, { name: "Report" });
      const champ = await createDef(
        db,
        { targetEntity: "deal", type: "person", name: "Champion" },
        sig(),
      );
      const partner = await createDef(
        db,
        { targetEntity: "deal", type: "org", name: "Partner" },
        sig(),
      );
      if (!champ.ok) throw champ.error;
      if (!partner.ok) throw partner.error;
      const [hiddenPerson] = await db
        .insert(persons)
        .values({
          name: "Hidden Person",
          ownerId: report.id,
          visibilityLevel: "owner",
          customFields: {},
        })
        .returning();
      const [hiddenOrg] = await db
        .insert(organizations)
        .values({
          name: "Hidden Org",
          ownerId: report.id,
          visibilityLevel: "owner",
          customFields: {},
        })
        .returning();
      if (!hiddenPerson || !hiddenOrg) throw new Error("seed failed");

      const labels = await resolveCustomFieldRefLabels(
        db,
        manager(boss.id, [report.id]),
        [champ.value, partner.value],
        [{ customFields: { champion: hiddenPerson.id, partner: hiddenOrg.id } }],
        sig(),
      );
      expect(labels.person[hiddenPerson.id]).toBeUndefined();
      expect(labels.org[hiddenOrg.id]).toBeUndefined();
    });
  });

  it("returns the empty map without querying when no reference def exists", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const text: CustomFieldDef = {
        id: "x",
        targetEntity: "deal",
        type: "text",
        name: "T",
        key: "t",
        options: [],
        isRequired: false,
        isImportant: false,
        showInAddForm: false,
        order: 0,
        archivedAt: null,
      };
      const labels = await resolveCustomFieldRefLabels(
        db,
        regular(me.id),
        [text],
        [{ customFields: { t: "abc" } }],
        sig(),
      );
      expect(labels).toEqual({ user: {}, person: {}, org: {} });
    });
  });

  it("returns an empty bucket for a non-uuid value on a reference def, without throwing", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const rep = await createDef(db, { targetEntity: "deal", type: "user", name: "Rep" }, sig());
      if (!rep.ok) throw rep.error;
      const labels = await resolveCustomFieldRefLabels(
        db,
        regular(me.id),
        [rep.value],
        [{ customFields: { rep: "west" } }],
        sig(),
      );
      expect(labels).toEqual({ user: {}, person: {}, org: {} });
    });
  });

  it("attachRefLabels adds refLabels next to rows", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, { name: "Me" });
      const rep = await createDef(db, { targetEntity: "person", type: "user", name: "Rep" }, sig());
      if (!rep.ok) throw rep.error;
      const out = await attachRefLabels(
        db,
        regular(me.id),
        "person",
        { rows: [{ customFields: { rep: me.id } }], total: 1 },
        sig(),
      );
      expect(out.total).toBe(1);
      expect(out.refLabels.user[me.id]).toBe("Me");
    });
  });
});

describe("resolveCustomFieldRefLabelsFor", () => {
  it("resolves each group with only its own defs, so a colliding key across targets never leaks", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db, { name: "Me" });
      const dealRegion = await createDef(
        db,
        { targetEntity: "deal", type: "text", name: "region" },
        sig(),
      );
      const personRegion = await createDef(
        db,
        { targetEntity: "person", type: "user", name: "region" },
        sig(),
      );
      if (!dealRegion.ok) throw dealRegion.error;
      if (!personRegion.ok) throw personRegion.error;
      const labels = await resolveCustomFieldRefLabelsFor(
        db,
        regular(me.id),
        [
          { defs: [dealRegion.value], rows: [{ customFields: { region: "west" } }] },
          { defs: [personRegion.value], rows: [{ customFields: { region: me.id } }] },
        ],
        sig(),
      );
      expect(labels.user[me.id]).toBe("Me");
      expect(Object.keys(labels.user)).toEqual([me.id]);
    });
  });

  it("resolves distinct users referenced from two different groups, in one batched lookup per kind", async () => {
    await withTestDb(async (db) => {
      const a = await seedUser(db, { name: "Alice" });
      const b = await seedUser(db, { name: "Bob" });
      const repA = await createDef(db, { targetEntity: "deal", type: "user", name: "RepA" }, sig());
      const repB = await createDef(
        db,
        { targetEntity: "person", type: "user", name: "RepB" },
        sig(),
      );
      if (!repA.ok) throw repA.error;
      if (!repB.ok) throw repB.error;
      const selectSpy = vi.spyOn(db, "select");
      const labels = await resolveCustomFieldRefLabelsFor(
        db,
        regular(a.id),
        [
          { defs: [repA.value], rows: [{ customFields: { repa: a.id } }] },
          { defs: [repB.value], rows: [{ customFields: { repb: b.id } }] },
        ],
        sig(),
      );
      expect(labels.user[a.id]).toBe("Alice");
      expect(labels.user[b.id]).toBe("Bob");
      expect(selectSpy).toHaveBeenCalledTimes(1);
      selectSpy.mockRestore();
    });
  });
});

describe("mergeRefLabels", () => {
  it("unions buckets, later wins on the same id", () => {
    expect(
      mergeRefLabels(
        { user: { a: "A" }, person: {}, org: {} },
        { user: { a: "A2", b: "B" }, person: {}, org: {} },
      ),
    ).toEqual({ user: { a: "A2", b: "B" }, person: {}, org: {} });
  });
});
