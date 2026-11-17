import { describe, expect, it } from "vitest";
import { xAccountChatKeys, xAccountMembers, xAccounts } from "@/db/schema/xDms";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { listXAccountsForAdmin, setXAccountMembers } from "./accountAdmin";

const sig = () => new AbortController().signal;

describe("listXAccountsForAdmin", () => {
  it("admin sees every account with members, status and sync fields", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const member = await seedUser(db);
      const lastSyncAt = new Date("2026-11-01T10:00:00Z");
      const [a] = await db
        .insert(xAccounts)
        .values({
          xUserId: "x-1",
          username: "brand",
          displayName: "Brand",
          status: "reconnect_required",
          lastErrorId: "E_X_010",
          lastSyncAt,
          overdueAfterHours: 12,
        })
        .returning({ id: xAccounts.id });
      await db.insert(xAccounts).values({ xUserId: "x-2", username: "other", displayName: "Zed" });
      if (!a) throw new Error("seed failed");
      await db.insert(xAccountMembers).values({ accountId: a.id, userId: member.id });
      const r = await listXAccountsForAdmin(db, admin.id, sig());
      if (!r.ok) throw new Error("expected ok");
      expect(r.value.map((x) => x.displayName)).toEqual(["Brand", "Zed"]);
      expect(r.value[0]).toEqual({
        id: a.id,
        displayName: "Brand",
        username: "brand",
        status: "reconnect_required",
        memberIds: [member.id],
        lastSyncAt,
        lastErrorId: "E_X_010",
        overdueAfterHours: 12,
        chatKeyState: "locked",
        chatKeysUnlockedAt: null,
        chatKeysUnlockedByName: null,
      });
      expect(r.value[1]?.memberIds).toEqual([]);
    });
  });

  it("reports unlocked keys with who unlocked them and when", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const unlockedAt = new Date("2026-11-10T10:00:00Z");
      const [a] = await db
        .insert(xAccounts)
        .values({ xUserId: "x-3", username: "keyed", displayName: "Keyed" })
        .returning({ id: xAccounts.id });
      if (!a) throw new Error("seed failed");
      await db.insert(xAccountChatKeys).values({
        accountId: a.id,
        keyVersion: "1",
        keysEnc: Buffer.from("x"),
        unlockedAt,
        unlockedByUserId: admin.id,
      });
      const r = await listXAccountsForAdmin(db, admin.id, sig());
      if (!r.ok) throw new Error("expected ok");
      expect(r.value[0]?.chatKeyState).toBe("unlocked");
      expect(r.value[0]?.chatKeysUnlockedAt).toEqual(unlockedAt);
      expect(r.value[0]?.chatKeysUnlockedByName).toBe(admin.name);
    });
  });

  it("leaves deactivated members out so saving the shown list succeeds", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const departed = await seedUser(db, { isActive: false });
      const [a] = await db
        .insert(xAccounts)
        .values({ xUserId: "x-4", username: "team", displayName: "Team" })
        .returning({ id: xAccounts.id });
      if (!a) throw new Error("seed failed");
      await db.insert(xAccountMembers).values([
        { accountId: a.id, userId: admin.id },
        { accountId: a.id, userId: departed.id },
      ]);
      const r = await listXAccountsForAdmin(db, admin.id, sig());
      if (!r.ok) throw new Error("expected ok");
      expect(r.value[0]?.memberIds).toEqual([admin.id]);
      const saved = await setXAccountMembers(
        db,
        { actorId: admin.id, accountId: a.id, userIds: r.value[0]?.memberIds ?? [] },
        sig(),
      );
      expect(saved.ok).toBe(true);
    });
  });

  it("rejects a non-admin", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const r = await listXAccountsForAdmin(db, user.id, sig());
      expect(r.ok ? null : r.error.id).toBe("E_PERM_006");
    });
  });
});
