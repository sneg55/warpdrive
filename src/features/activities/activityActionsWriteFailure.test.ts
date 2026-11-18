import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermSetUser } from "@/features/permissions/effective";
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

const scheduleReminderMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("./reminders", () => ({ scheduleReminder: scheduleReminderMock }));

const ctxActor: { current: PermSetUser | null } = { current: null };
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor: ctxActor.current })),
}));

import { sql } from "drizzle-orm";
import { ERROR_IDS } from "@/constants/errorIds";
import { activities } from "@/db/schema/activities";
import { activityTypes } from "@/db/schema/activityTypes";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { createActivityAction, editActivityAction } from "./actions";

const REJECTED_SUBJECT = "Rejected by constraint";

async function rejectSubject(): Promise<void> {
  await testDbHolder.db!.db.execute(
    sql.raw(
      `ALTER TABLE activities ADD CONSTRAINT probe_reject CHECK (subject <> '${REJECTED_SUBJECT}')`,
    ),
  );
}

async function seedType(): Promise<string> {
  const [row] = await testDbHolder
    .db!.db.insert(activityTypes)
    .values({ key: "probe-call", name: "Probe call" })
    .returning();
  return row!.id;
}

describe("activity actions return a Result when the write throws", () => {
  beforeEach(async () => {
    testDbHolder.db = await makeTestDb();
    const admin = await seedUser(testDbHolder.db.db, { isAdmin: true });
    ctxActor.current = {
      id: admin.id,
      type: "admin",
      isActive: true,
      groupIds: new Set(),
      managedUserIds: new Set(),
      flags: new Set(),
    };
  });
  afterEach(async () => {
    await testDbHolder.db?.close();
    testDbHolder.db = null;
    ctxActor.current = null;
  });

  it("createActivityAction returns DB_WRITE_FAILED when the insert is rejected", async () => {
    const typeId = await seedType();
    await rejectSubject();
    const r = await createActivityAction({ typeId, subject: REJECTED_SUBJECT }, "csrf");
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
  });

  it("editActivityAction returns DB_WRITE_FAILED when the update is rejected", async () => {
    const typeId = await seedType();
    const created = await createActivityAction({ typeId, subject: "Original" }, "csrf");
    if (!created.ok) throw new Error("seed activity failed");
    await rejectSubject();
    const r = await editActivityAction({ id: created.value.id, subject: REJECTED_SUBJECT }, "csrf");
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
    const [row] = await testDbHolder.db!.db.select().from(activities);
    expect(row?.subject).toBe("Original");
  });

  it("createActivityAction succeeds once when only the reminder scheduling rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const typeId = await seedType();
    scheduleReminderMock.mockRejectedValueOnce(new Error("boss.send failed"));
    const r = await createActivityAction(
      { typeId, subject: "Reminder fails", dueAt: "2030-01-01T10:00:00.000Z" },
      "csrf",
    );
    expect(r.ok).toBe(true);
    const rows = await testDbHolder.db!.db.select().from(activities);
    expect(rows).toHaveLength(1);
  });
});
