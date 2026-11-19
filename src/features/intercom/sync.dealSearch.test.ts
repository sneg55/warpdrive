import type { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTERCOM_CONTACT_CACHE_TTL_MS } from "@/constants/intercom";
import { PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH } from "@/constants/jobNames";
import { withTestDb } from "@/db/testing";
import { seedWorld, type TestDb } from "@/features/search/search.test-helpers";
import { setBoss } from "@/jobs/boss";
import { linkedDeal } from "./dealSearch/dealSearch.test-helpers";
import { refreshDealIntercomSearch } from "./dealSearch/refresh";
import { comment, type IntercomFake, makeIntercomFake, source } from "./intercomFake.test-helpers";
import { runIntercomSync } from "./sync";

const NOW_S = 1_800_000_000;
const SIG = (): AbortSignal => new AbortController().signal;

type Send = (name: string, data: unknown, options: unknown) => Promise<string | null>;

function fakeBoss() {
  const send = vi.fn<Send>(() => Promise.resolve("job"));
  setBoss({ send } as unknown as PgBoss);
  return send;
}

function queuedDeals(send: ReturnType<typeof fakeBoss>): string[] {
  return send.mock.calls
    .filter((c) => c[0] === PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH)
    .map((c) => (c[1] as { dealId: string }).dealId);
}

function addConversation(fake: IntercomFake, id: string, updatedAt: number, contacts: string[]) {
  fake.conversations.set(id, {
    id,
    updated_at: updatedAt,
    source: source(`<p>${id}</p>`),
    contacts,
    parts: [comment(`${id}-p1`, updatedAt)],
  });
}

function run(db: TestDb, fake: IntercomFake, nowMs = NOW_S * 1000) {
  return runIntercomSync({ db, client: fake.client, nowMs: () => nowMs }, SIG());
}

afterEach(() => {
  setBoss(null as unknown as PgBoss);
});

describe("Intercom sync enqueues deal search refreshes", () => {
  it("queues the deals of persons matching a synced conversation's contact", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const hit = await linkedDeal(db, w, "pat@example.com");
      await linkedDeal(db, w, "someone@else.com");
      const send = fakeBoss();
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "Pat@Example.com" });
      addConversation(fake, "c1", NOW_S - 50, ["k1"]);
      await run(db, fake);
      expect(queuedDeals(send)).toEqual([hit.dealId]);
    });
  });

  it("queues nothing when no person matches", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await linkedDeal(db, w, "someone@else.com");
      const send = fakeBoss();
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 50, ["k1"]);
      await run(db, fake);
      expect(queuedDeals(send)).toEqual([]);
    });
  });

  it("queues the former and the new deal when a refreshed contact changes email", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const former = await linkedDeal(db, w, "old@example.com");
      const next = await linkedDeal(db, w, "new@example.com");
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "old@example.com" });
      addConversation(fake, "c1", NOW_S - 50, ["k1"]);
      const send = fakeBoss();
      await run(db, fake);
      expect(queuedDeals(send)).toEqual([former.dealId]);
      await refreshDealIntercomSearch(db, [former.dealId], SIG());
      send.mockClear();
      fake.contacts.set("k1", { id: "k1", email: "new@example.com" });
      await run(db, fake, NOW_S * 1000 + INTERCOM_CONTACT_CACHE_TTL_MS + 1000);
      expect(queuedDeals(send).sort()).toEqual([former.dealId, next.dealId].sort());
    });
  });

  it("queues nothing for a refreshed contact whose email is unchanged", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await linkedDeal(db, w, "pat@example.com");
      const fake = makeIntercomFake();
      fake.contacts.set("k1", { id: "k1", email: "pat@example.com" });
      addConversation(fake, "c1", NOW_S - 50, ["k1"]);
      const send = fakeBoss();
      await run(db, fake);
      send.mockClear();
      await run(db, fake, NOW_S * 1000 + INTERCOM_CONTACT_CACHE_TTL_MS + 1000);
      expect(queuedDeals(send)).toEqual([]);
    });
  });
});
