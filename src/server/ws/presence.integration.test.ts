import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import type { WebSocket } from "ws";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals, pipelines, sessions, stages, users } from "@/db/schema";
import { sessionFixture } from "@/features/auth/session.test-helpers";
import { connect, h, nextMessage, opened } from "./testHarness.test";
import { mintTicket } from "./ticket";

let adminIdA: string;
let adminSessionA: string;
let adminIdB: string;
let adminSessionB: string;

async function seedDealChannel(db: typeof h.db, ownerId: string): Promise<string> {
  const [pipe] = await db.insert(pipelines).values({ name: "Presence pipeline" }).returning();
  const pipelineId = pipe!.id;
  const [stage] = await db.insert(stages).values({ pipelineId, name: "Stage 1" }).returning();
  const [deal] = await db
    .insert(deals)
    .values({
      title: "Presence deal",
      pipelineId,
      stageId: stage!.id,
      ownerId,
      visibilityLevel: "all",
    })
    .returning();
  return deal!.id;
}

beforeEach(async () => {
  const [a] = await h.db
    .insert(users)
    .values({ email: "pa@example.com", name: "Alice", googleSub: "g-pa", isAdmin: true })
    .returning();
  adminIdA = a!.id;
  const [sa] = await h.db
    .insert(sessions)
    .values(sessionFixture({ userId: adminIdA, expiresAt: new Date(Date.now() + 3_600_000) }))
    .returning();
  adminSessionA = sa!.id;

  const [b] = await h.db
    .insert(users)
    .values({ email: "pb@example.com", name: "Bob", googleSub: "g-pb", isAdmin: true })
    .returning();
  adminIdB = b!.id;
  const [sb] = await h.db
    .insert(sessions)
    .values(sessionFixture({ userId: adminIdB, expiresAt: new Date(Date.now() + 3_600_000) }))
    .returning();
  adminSessionB = sb!.id;
});

async function authedAdmin(uid: string, sid: string) {
  const ws = connect();
  await opened(ws);
  const token = await mintTicket({ userId: uid, sessionId: sid });
  ws.send(JSON.stringify({ kind: "auth", ticket: token }));
  await nextMessage(ws, "auth_ok");
  return ws;
}

type PresenceMsg = { kind: string; channel: string; users: { userId: string; name: string }[] };

function nextPresence(ws: WebSocket, channel: string, ms = 4000): Promise<PresenceMsg> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AppError(ERROR_IDS.DB_INVARIANT, `expected presence on ${channel}`)),
      ms,
    );
    const onMsg = (raw: Buffer): void => {
      const msg = JSON.parse(raw.toString()) as { kind?: string; channel?: string };
      if (msg.kind === "presence" && msg.channel === channel) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(msg as PresenceMsg);
      }
    };
    ws.on("message", onMsg);
  });
}

describe("ws server presence", () => {
  test("two users subscribing to the same deal channel both appear in presence frames", async () => {
    const dealId = await seedDealChannel(h.db, adminIdA);
    const ch = `deal:${dealId}`;

    const wsA = await authedAdmin(adminIdA, adminSessionA);
    wsA.send(JSON.stringify({ kind: "subscribe", channel: ch }));
    const pA1 = await nextPresence(wsA, ch);
    expect(pA1.users).toEqual([{ userId: adminIdA, name: "Alice" }]);

    const wsB = await authedAdmin(adminIdB, adminSessionB);
    const pAOnBJoin = nextPresence(wsA, ch);
    wsB.send(JSON.stringify({ kind: "subscribe", channel: ch }));
    await nextMessage(wsB, "subscribed");

    const pAfterBJoins = await pAOnBJoin;
    expect(pAfterBJoins.users).toHaveLength(2);
    expect(pAfterBJoins.users.map((u) => u.name).sort()).toEqual(["Alice", "Bob"]);

    const pAOnBLeave = nextPresence(wsA, ch);
    wsB.send(JSON.stringify({ kind: "unsubscribe", channel: ch }));
    await nextMessage(wsB, "unsubscribed");

    const pAfterBLeaves = await pAOnBLeave;
    expect(pAfterBLeaves.users).toEqual([{ userId: adminIdA, name: "Alice" }]);
  });

  test("closing a socket removes that user from presence and notifies survivors", async () => {
    const dealId = await seedDealChannel(h.db, adminIdA);
    const ch = `deal:${dealId}`;

    const wsA = await authedAdmin(adminIdA, adminSessionA);
    wsA.send(JSON.stringify({ kind: "subscribe", channel: ch }));
    await nextPresence(wsA, ch);

    const wsB = await authedAdmin(adminIdB, adminSessionB);
    const pAOnBJoin = nextPresence(wsA, ch);
    wsB.send(JSON.stringify({ kind: "subscribe", channel: ch }));
    await nextMessage(wsB, "subscribed");
    await pAOnBJoin;

    const pAAfterClose = nextPresence(wsA, ch);
    wsB.close();
    const pAfterClose = await pAAfterClose;
    expect(pAfterClose.users).toEqual([{ userId: adminIdA, name: "Alice" }]);
  });

  test("presence frames do not advance the relay seq counter", async () => {
    const dealId = await seedDealChannel(h.db, adminIdA);
    const ch = `deal:${dealId}`;

    const wsA = await authedAdmin(adminIdA, adminSessionA);
    const dealSubscribed = nextMessage(wsA, "subscribed");
    const initialPresence = nextPresence(wsA, ch);
    wsA.send(JSON.stringify({ kind: "subscribe", channel: ch }));
    await Promise.all([dealSubscribed, initialPresence]);

    const userSubscribed = nextMessage(wsA, "subscribed");
    wsA.send(JSON.stringify({ kind: "subscribe", channel: `user:${adminIdA}` }));
    expect((await userSubscribed).channel).toBe(`user:${adminIdA}`);

    const eventP = nextMessage(wsA, "event");
    await h.db.execute(
      sql`SELECT pg_notify(${`user:${adminIdA}`}, ${JSON.stringify({
        v: 1,
        channel: `user:${adminIdA}`,
        ts: new Date().toISOString(),
        actorId: null,
        type: "note_added",
        data: { noteId: "n1", dealId: "d1" },
      })})`,
    );
    const event = await eventP;
    expect((event.event as { seq: number }).seq).toBe(0);
  });
});
