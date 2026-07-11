import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { auditEvents } from "@/db/schema";
import type { TestDb } from "@/test/db";
import { makeTestDb } from "@/test/db";
import { recordAudit } from "./audit";

describe("recordAudit (real Postgres)", () => {
  let tdb: TestDb;

  beforeAll(async () => {
    tdb = await makeTestDb();
  }, 60_000);

  afterAll(async () => {
    await tdb.close();
  });

  test("writes one audit_events row with all fields", async () => {
    const signal = AbortSignal.timeout(5_000);

    await recordAudit(
      tdb.db,
      {
        actorId: null,
        targetType: "permission_set",
        targetId: null,
        action: "permission_set.flags.updated",
        before: { flags: { "data.export": false } },
        after: { flags: { "data.export": true } },
        correlationId: null,
      },
      signal,
    );

    const rows = await tdb.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "permission_set.flags.updated"));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.targetType).toBe("permission_set");
    expect(row.before).toEqual({ flags: { "data.export": false } });
    expect(row.after).toEqual({ flags: { "data.export": true } });
    expect(row.actorId).toBeNull();
    expect(row.targetId).toBeNull();
    expect(row.correlationId).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  test("aborted signal prevents the write", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      recordAudit(
        tdb.db,
        {
          actorId: null,
          targetType: "user",
          targetId: null,
          action: "user.role.toggled",
        },
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});
