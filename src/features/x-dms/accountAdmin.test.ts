import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccountMembers, xAccounts, xConversations, xMessages } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { encryptToken } from "@/features/email/crypto";
import { ok } from "@/types/result";
import { disconnectXAccount, setXAccountMembers, updateXAccount } from "./accountAdmin";
import { makeXFake } from "./xFake.test-helpers";

const sig = () => new AbortController().signal;

async function seedAccount(db: Db): Promise<string> {
  const [row] = await db
    .insert(xAccounts)
    .values({
      xUserId: `x-${Math.random().toString(36).slice(2)}`,
      username: "brand",
      displayName: "Brand",
      refreshTokenEnc: encryptToken("refresh-1"),
    })
    .returning({ id: xAccounts.id });
  if (!row) throw new Error("seed failed");
  return row.id;
}

describe("x account admin", () => {
  it("non-admin cannot manage", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const accountId = await seedAccount(db);
      const r = await updateXAccount(
        db,
        { actorId: user.id, accountId, displayName: "N", overdueAfterHours: 24 },
        sig(),
      );
      expect(r.ok ? null : r.error.id).toBe("E_PERM_006");
      const m = await setXAccountMembers(db, { actorId: user.id, accountId, userIds: [] }, sig());
      expect(m.ok ? null : m.error.id).toBe("E_PERM_006");
      const d = await disconnectXAccount(
        db,
        makeXFake().client,
        { actorId: user.id, accountId },
        sig(),
      );
      expect(d.ok ? null : d.error.id).toBe("E_PERM_006");
    });
  });

  it("updates display name and overdue line", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const r = await updateXAccount(
        db,
        { actorId: admin.id, accountId, displayName: "Affiliates", overdueAfterHours: 12 },
        sig(),
      );
      expect(r.ok).toBe(true);
      const [row] = await db.select().from(xAccounts).where(eq(xAccounts.id, accountId));
      expect(row).toMatchObject({ displayName: "Affiliates", overdueAfterHours: 12 });
      const missing = await updateXAccount(
        db,
        {
          actorId: admin.id,
          accountId: "00000000-0000-4000-8000-000000000000",
          displayName: "x",
          overdueAfterHours: 1,
        },
        sig(),
      );
      expect(missing.ok ? null : missing.error.id).toBe("E_X_007");
    });
  });

  it("members must be active users", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const a = await seedUser(db);
      const b = await seedUser(db);
      const gone = await seedUser(db, { isActive: false });
      const accountId = await seedAccount(db);
      const bad = await setXAccountMembers(
        db,
        { actorId: admin.id, accountId, userIds: [a.id, gone.id] },
        sig(),
      );
      expect(bad.ok ? null : bad.error.id).toBe("E_X_009");
      expect(await db.select().from(xAccountMembers)).toHaveLength(0);
      const good = await setXAccountMembers(
        db,
        { actorId: admin.id, accountId, userIds: [a.id, b.id, a.id] },
        sig(),
      );
      expect(good.ok).toBe(true);
      const swap = await setXAccountMembers(
        db,
        { actorId: admin.id, accountId, userIds: [b.id] },
        sig(),
      );
      expect(swap.ok).toBe(true);
      const rows = await db.select().from(xAccountMembers);
      expect(rows.map((r) => r.userId)).toEqual([b.id]);
      const missing = await setXAccountMembers(
        db,
        { actorId: admin.id, accountId: "00000000-0000-4000-8000-000000000000", userIds: [] },
        sig(),
      );
      expect(missing.ok ? null : missing.error.id).toBe("E_X_007");
    });
  });

  it("disconnect revokes and deletes conversations", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const [conv] = await db
        .insert(xConversations)
        .values({ accountId, xConversationId: "c-1", participantXUserId: "p-1" })
        .returning({ id: xConversations.id });
      await db.insert(xMessages).values({
        conversationId: conv?.id ?? "",
        xEventId: "e-1",
        direction: "inbound",
        senderXUserId: "p-1",
        text: "hi",
        sentAt: new Date(),
      });
      const revoked: string[] = [];
      const fake = makeXFake();
      fake.client = {
        ...fake.client,
        revoke: (t) => {
          revoked.push(t);
          return Promise.resolve(ok(undefined));
        },
      };
      const r = await disconnectXAccount(db, fake.client, { actorId: admin.id, accountId }, sig());
      expect(r).toEqual(ok(undefined));
      expect(revoked).toEqual(["refresh-1"]);
      expect(await db.select().from(xAccounts)).toHaveLength(0);
      expect(await db.select().from(xConversations)).toHaveLength(0);
      expect(await db.select().from(xMessages)).toHaveLength(0);
    });
  });

  it("disconnect still deletes when revoke fails", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const accountId = await seedAccount(db);
      const fake = makeXFake();
      fake.failNext.set("revoke", new AppError(ERROR_IDS.X_HTTP_FAILED, "boom", {}));
      const r = await disconnectXAccount(db, fake.client, { actorId: admin.id, accountId }, sig());
      expect(r.ok).toBe(true);
      expect(await db.select().from(xAccounts)).toHaveLength(0);
    });
  });
});
