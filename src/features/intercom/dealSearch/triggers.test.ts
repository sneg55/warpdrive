import { eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH } from "@/constants/jobNames";
import { deals } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages } from "@/db/testing/factories";
import { mergePersons } from "@/features/contacts/merge";
import { adminActor } from "@/features/contacts/mergeTestActors";
import { updatePerson } from "@/features/contacts/personsRepo";
import { duplicateDeal } from "@/features/deal-workspace/duplicateDeal";
import { addParticipant, removeParticipant } from "@/features/deal-workspace/participants";
import { createDeal, updateDeal } from "@/features/deals/dealActions";
import { convertLead } from "@/features/leads/leadConvert";
import { insertLead, seedSettings, session, sig } from "@/features/leads/leadConvert.test-helpers";
import { seedWorld, type World } from "@/features/search/search.test-helpers";
import { setBoss } from "@/jobs/boss";
import { addParticipantRow, linkedDeal } from "./dealSearch.test-helpers";

type Send = (name: string, data: unknown, options: unknown) => Promise<string | null>;

function fakeBoss() {
  const send = vi.fn<Send>(() => Promise.resolve("job"));
  setBoss({ send } as unknown as PgBoss);
  return send;
}

function queued(send: ReturnType<typeof fakeBoss>): string[] {
  return [
    ...new Set(
      send.mock.calls
        .filter((c) => c[0] === PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH)
        .map((c) => (c[1] as { dealId: string }).dealId),
    ),
  ];
}

afterEach(() => {
  setBoss(null as unknown as PgBoss);
});

function admin(w: World) {
  return adminActor(w.alice.id);
}

describe("deal and person changes queue a deal search refresh", () => {
  it("queues the deal when a participant is added or removed", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      const send = fakeBoss();
      const actor = admin(w);
      await addParticipant(db, actor, a.dealId, b.personId, null, sig());
      expect(queued(send)).toEqual([a.dealId]);
      send.mockClear();
      await removeParticipant(db, actor, a.dealId, b.personId, sig());
      expect(queued(send)).toEqual([a.dealId]);
    });
  });

  it("queues the deal when its person changes", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      const [row] = await db.select().from(deals).where(eq(deals.id, a.dealId));
      const send = fakeBoss();
      const r = await updateDeal(
        db,
        admin(w),
        {
          dealId: a.dealId,
          expectedUpdatedAt: row?.updatedAt.toISOString(),
          personId: b.personId,
        },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect(queued(send)).toEqual([a.dealId]);
    });
  });

  it("does not queue when a deal update leaves the person alone", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const [row] = await db.select().from(deals).where(eq(deals.id, a.dealId));
      const send = fakeBoss();
      await updateDeal(
        db,
        admin(w),
        { dealId: a.dealId, expectedUpdatedAt: row?.updatedAt.toISOString(), title: "Renamed" },
        sig(),
      );
      expect(queued(send)).toEqual([]);
    });
  });

  it("queues every deal of a person whose emails change", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      await addParticipantRow(db, b.dealId, a.personId);
      const send = fakeBoss();
      const r = await updatePerson(
        db,
        admin(w),
        { id: a.personId, emails: [{ label: "work", value: "changed@acme.com", primary: true }] },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect(queued(send).sort()).toEqual([a.dealId, b.dealId].sort());
    });
  });

  it("does not queue when a person update leaves the emails alone", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const send = fakeBoss();
      await updatePerson(db, admin(w), { id: a.personId, name: "Renamed" }, sig());
      expect(queued(send)).toEqual([]);
    });
  });

  it("queues the survivor's deals when persons are merged", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const survivor = await linkedDeal(db, w, "keep@acme.com");
      const merged = await linkedDeal(db, w, "gone@acme.com");
      const send = fakeBoss();
      const r = await mergePersons(
        db,
        admin(w),
        { survivorId: survivor.personId, mergedId: merged.personId, fieldChoices: {} },
        sig(),
      );
      expect(r.ok).toBe(true);
      expect(queued(send).sort()).toEqual([survivor.dealId, merged.dealId].sort());
    });
  });

  it("queues a newly created deal that has a person", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      await seedSettings(db, { defaultPipelineId: w.pipelineId });
      const send = fakeBoss();
      const r = await createDeal(
        db,
        { ...session(w.alice.id), isAdmin: true },
        { title: "New", pipelineId: w.pipelineId, stageId: w.stageId, personId: a.personId },
        sig(),
      );
      if (r.ok === false) throw r.error;
      expect(queued(send)).toEqual([r.value.id]);
    });
  });

  it("queues a duplicated deal", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      await seedSettings(db, { defaultPipelineId: w.pipelineId });
      const send = fakeBoss();
      const r = await duplicateDeal(db, admin(w), { dealId: a.dealId }, sig());
      if (r.ok === false) throw r.error;
      expect(queued(send)).toEqual([r.value.id]);
    });
  });

  it("queues the deal created by converting a lead with a person", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const pipe = await seedPipelineWithStages(db, ["Qualify"]);
      await seedSettings(db, { defaultPipelineId: pipe.pipeline.id });
      const lead = await insertLead(db, w.alice.id, { personId: a.personId });
      const send = fakeBoss();
      const r = await convertLead(
        db,
        session(w.alice.id),
        { leadId: lead.id, expectedUpdatedAt: lead.updatedAt.toISOString() },
        sig(),
      );
      if (r.ok === false) throw r.error;
      expect(queued(send)).toEqual([r.value.dealId]);
    });
  });
});
