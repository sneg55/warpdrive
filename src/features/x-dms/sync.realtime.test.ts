import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { wsChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { channelVersions } from "@/db/schema/realtime";
import { xAccountMembers, xConversations } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  buildChatFixtures,
  type ChatFixtures,
  FIXTURE_ME,
  FIXTURE_THEM,
} from "./eventFixtures.test-helpers";
import { breakRealtimePublish, restoreRealtimePublish } from "./realtimeFailure.test-helpers";
import { runXSync } from "./sync";
import {
  addEvents,
  conversationRow,
  DAY_MS,
  deps,
  eventFrom,
  messageRows,
  NOW_MS,
  putConversation,
  seedAccount,
} from "./syncSeed.test-helpers";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;

let f: ChatFixtures;
beforeAll(async () => {
  f = await buildChatFixtures();
});

const inbound = (daysAgo: number) =>
  eventFrom(f.plaintextMessage, { at: NOW_MS - daysAgo * DAY_MS, senderId: FIXTURE_THEM });

async function versionOf(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ version: channelVersions.version })
    .from(channelVersions)
    .where(eq(channelVersions.channel, wsChannel.user(userId)));
  return Number(row?.version ?? 0);
}

describe("runXSync encrypted directions", () => {
  it("an encrypted inbound before a newer encrypted outbound still reopens the conversation", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      putConversation(fake, { events: [inbound(3)] });
      await runXSync(deps(db, fake), accountId, sig());
      await db
        .update(xConversations)
        .set({ archivedAt: new Date(NOW_MS - DAY_MS) })
        .where(eq(xConversations.accountId, accountId));
      const sealedIn = eventFrom(f.encryptedMessage, {
        at: NOW_MS - DAY_MS / 2,
        senderId: FIXTURE_THEM,
      });
      const sealedOut = eventFrom(f.encryptedMessage, {
        at: NOW_MS - DAY_MS / 4,
        senderId: FIXTURE_ME,
      });
      addEvents(fake, [sealedOut, sealedIn]);
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      expect(row?.archivedAt).toBeNull();
      expect(row?.teamReadAt).toBeNull();
      expect(row?.lastInboundAt).toEqual(sealedIn.createdAt);
      expect(row?.lastMessageAt).toEqual(sealedOut.createdAt);
      const placeholders = (await messageRows(db, row?.id ?? "")).filter((m) => m.text === "");
      expect(placeholders.map((m) => [m.xEventId, m.direction])).toEqual([
        [sealedIn.id, "inbound"],
        [sealedOut.id, "outbound"],
      ]);
    });
  });
});

describe("runXSync realtime", () => {
  it("publishes one conversation update per member for new messages only", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      const members = [await seedUser(db), await seedUser(db)];
      const outsider = await seedUser(db);
      await db.insert(xAccountMembers).values(members.map((m) => ({ accountId, userId: m.id })));
      putConversation(fake, { events: [inbound(2)] });
      await runXSync(deps(db, fake), accountId, sig());
      expect(await Promise.all(members.map((m) => versionOf(db, m.id)))).toEqual([1, 1]);
      await runXSync(deps(db, fake), accountId, sig());
      expect(await Promise.all(members.map((m) => versionOf(db, m.id)))).toEqual([1, 1]);
      addEvents(fake, [inbound(1)]);
      await runXSync(deps(db, fake), accountId, sig());
      expect(await Promise.all(members.map((m) => versionOf(db, m.id)))).toEqual([2, 2]);
      expect(await versionOf(db, outsider.id)).toBe(0);
    });
  });

  it("publishes in the apply transaction, so a failed publish stores nothing and the retry notifies", async () => {
    await withTestDb(async (db) => {
      const fake = makeXFake();
      const accountId = await seedAccount(db);
      const member = await seedUser(db);
      await db.insert(xAccountMembers).values({ accountId, userId: member.id });
      putConversation(fake, { events: [inbound(2)] });
      await breakRealtimePublish(db);
      await expect(runXSync(deps(db, fake), accountId, sig())).rejects.toThrow();
      expect(await conversationRow(db, accountId)).toBeUndefined();
      await restoreRealtimePublish(db);
      await runXSync(deps(db, fake), accountId, sig());
      const row = await conversationRow(db, accountId);
      expect(await messageRows(db, row?.id ?? "")).toHaveLength(1);
      expect(await versionOf(db, member.id)).toBe(1);
    });
  });
});
