// Integration test for the readActions.ts server-action boundary. Real Postgres (via
// makeTestDb), redirected into the prod db singleton the same way server/worker.test.ts does:
// this is NOT mocking the DB, just pointing @/db/client at the test container instead of the
// placeholder URL from vitest.setup.ts. Only the request-context boundary (createContext,
// guardCsrf) is mocked, since those depend on next/headers rather than the database.
//
// Bug: markThreadReadAction/markThreadUnreadAction built a bare toActor(ctx.actor.id) (always
// type: "regular", empty groupIds) before calling markThreadRead/markThreadUnread, instead of
// passing the hydrated ctx.actor. canSeeEmail's shared-thread path defers to canSee, which needs
// the real type (admin bypass) and groupIds (visibility-group membership) to grant access to a
// thread the actor can see only via one of those, not as the mailbox owner.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/features/permissions/types";
import type { TestDb } from "@/test/db";

const testDbHolder: { db: TestDb | null } = { db: null };

vi.mock("@/db/client", () => ({
  get db() {
    if (testDbHolder.db === null) throw new Error("testDbHolder.db not initialized");
    return testDbHolder.db.db;
  },
}));
vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: vi.fn(() => Promise.resolve({ ok: true })),
}));

const ctxActor: { current: AuthUser | null } = { current: null };
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor: ctxActor.current })),
}));

import { sql } from "drizzle-orm";
import { deals } from "@/db/schema";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { markThreadReadAction, markThreadUnreadAction } from "./readActions";

async function seedSharedDealThread(
  db: TestDb["db"],
  opts: { dealOwnerId: string; mailboxOwnerId: string; visibilityGroupId?: string },
): Promise<string> {
  const p = await seedPipelineWithStages(db, ["A"]);
  const [deal] = await db
    .insert(deals)
    .values({
      title: "D",
      pipelineId: p.pipeline.id,
      stageId: p.stages[0]!.id,
      ownerId: opts.dealOwnerId,
      visibilityLevel: opts.visibilityGroupId !== undefined ? "group" : "owner",
      visibilityGroupId: opts.visibilityGroupId ?? null,
    })
    .returning();
  if (!deal) throw new Error("deal seed failed");

  const acctRows = await db.execute(sql`
    INSERT INTO email_accounts (user_id, email_address, status)
    VALUES (${opts.mailboxOwnerId}, ${`mbx-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`}, 'connected')
    RETURNING id
  `);
  const acct = acctRows.rows[0] as { id: string };
  const threadRows = await db.execute(sql`
    INSERT INTO email_threads (gmail_thread_id, account_id, subject, last_message_at, visibility, deal_id)
    VALUES (${`g-${Date.now()}`}, ${acct.id}, 'Hi', now(), 'shared', ${deal.id})
    RETURNING id
  `);
  const thread = threadRows.rows[0] as { id: string };
  return thread.id;
}

describe("readActions actor visibility", () => {
  beforeEach(async () => {
    const h = await makeTestDb();
    testDbHolder.db = h;
  });
  afterEach(async () => {
    await testDbHolder.db?.close();
    testDbHolder.db = null;
    ctxActor.current = null;
    vi.clearAllMocks();
  });

  it("lets an admin (not the mailbox owner, not the deal owner) mark a shared thread read", async () => {
    const db = testDbHolder.db!.db;
    const mailboxOwner = await seedUser(db);
    const dealOwner = await seedUser(db);
    const admin = await seedUser(db, { isAdmin: true });
    const threadId = await seedSharedDealThread(db, {
      dealOwnerId: dealOwner.id,
      mailboxOwnerId: mailboxOwner.id,
    });

    ctxActor.current = { id: admin.id, type: "admin", isActive: true, groupIds: new Set() };
    const r = await markThreadReadAction("csrf", { threadId });
    expect(r.ok).toBe(true);
  });

  it("lets a visibility-group member (not owner, not admin) mark a shared thread unread", async () => {
    const db = testDbHolder.db!.db;
    const mailboxOwner = await seedUser(db);
    const dealOwner = await seedUser(db);
    const member = await seedUser(db);
    const groupId = "11111111-1111-4111-8111-111111111111";
    await db.execute(sql`INSERT INTO visibility_groups (id, name) VALUES (${groupId}, 'G')`);
    const threadId = await seedSharedDealThread(db, {
      dealOwnerId: dealOwner.id,
      mailboxOwnerId: mailboxOwner.id,
      visibilityGroupId: groupId,
    });

    ctxActor.current = {
      id: member.id,
      type: "regular",
      isActive: true,
      groupIds: new Set([groupId]),
    };
    // Mark read first (bypassing the action under test) so unread has a state to flip.
    await markThreadReadAction("csrf", { threadId });
    const r = await markThreadUnreadAction("csrf", { threadId });
    expect(r.ok).toBe(true);
  });

  it("still rejects a stranger who cannot see the thread via ownership, admin, or group", async () => {
    const db = testDbHolder.db!.db;
    const mailboxOwner = await seedUser(db);
    const dealOwner = await seedUser(db);
    const stranger = await seedUser(db);
    const threadId = await seedSharedDealThread(db, {
      dealOwnerId: dealOwner.id,
      mailboxOwnerId: mailboxOwner.id,
    });

    ctxActor.current = { id: stranger.id, type: "regular", isActive: true, groupIds: new Set() };
    const r = await markThreadReadAction("csrf", { threadId });
    expect(r.ok).toBe(false);
  });
});
