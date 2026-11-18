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

const ctxActor: { current: PermSetUser | null } = { current: null };
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn(() => Promise.resolve({ actor: ctxActor.current })),
}));

import { sql } from "drizzle-orm";
import { ERROR_IDS } from "@/constants/errorIds";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createOrgAction, createPersonAction } from "@/features/contacts/actions";
import { createDealAction } from "@/features/deals/createDealAction";
import { createLeadAction } from "@/features/leads/leadServerActions";
import { makeTestDb } from "@/test/db";

const REJECTED_TITLE = "Rejected by constraint";

async function signInAdmin(): Promise<void> {
  const admin = await seedUser(testDbHolder.db!.db, { isAdmin: true });
  ctxActor.current = {
    id: admin.id,
    type: "admin",
    isActive: true,
    groupIds: new Set(),
    managedUserIds: new Set(),
    flags: new Set(),
  };
}

async function rejectTitle(table: string, column: string): Promise<void> {
  await testDbHolder.db!.db.execute(
    sql.raw(
      `ALTER TABLE ${table} ADD CONSTRAINT probe_reject CHECK (${column} <> '${REJECTED_TITLE}')`,
    ),
  );
}

async function countRows(table: string, column: string, value: string): Promise<number> {
  const r = await testDbHolder.db!.db.execute(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${value}`,
  );
  return (r.rows[0] as { n: number }).n;
}

describe("create actions return a Result when the write throws", () => {
  beforeEach(async () => {
    testDbHolder.db = await makeTestDb();
    await signInAdmin();
  });
  afterEach(async () => {
    await testDbHolder.db?.close();
    testDbHolder.db = null;
    ctxActor.current = null;
  });

  it("createDealAction returns DB_WRITE_FAILED when the deal insert is rejected", async () => {
    const p = await seedPipelineWithStages(testDbHolder.db!.db, ["A"]);
    await rejectTitle("deals", "title");
    const r = await createDealAction(
      {
        title: REJECTED_TITLE,
        value: null,
        pipelineId: p.pipeline.id,
        stageId: p.stages[0]!.id,
        personId: null,
        orgId: null,
        expectedCloseDate: null,
        labels: [],
        sourceChannel: null,
        sourceChannelId: null,
      },
      "csrf",
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
    expect(await countRows("deals", "title", REJECTED_TITLE)).toBe(0);
  });

  it("createLeadAction returns DB_WRITE_FAILED when the lead insert is rejected", async () => {
    await rejectTitle("leads", "title");
    const r = await createLeadAction({ title: REJECTED_TITLE }, "csrf");
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
  });

  it("createLeadAction leaves no lead behind when its label sync is rejected", async () => {
    await rejectTitle("labels", "name");
    const r = await createLeadAction(
      { title: "Lead with a bad label", labels: [REJECTED_TITLE] },
      "csrf",
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
    expect(await countRows("leads", "title", "Lead with a bad label")).toBe(0);
  });

  it("createOrgAction returns DB_WRITE_FAILED when the organization insert is rejected", async () => {
    await rejectTitle("organizations", "name");
    const r = await createOrgAction(
      { name: REJECTED_TITLE, address: null, customFields: {} },
      "csrf",
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
  });

  it("createPersonAction returns DB_WRITE_FAILED when the person insert is rejected", async () => {
    await rejectTitle("persons", "name");
    const r = await createPersonAction(
      { name: REJECTED_TITLE, emails: [], phones: [], orgId: null, customFields: {} },
      "csrf",
    );
    expect(r).toEqual({ ok: false, error: { id: ERROR_IDS.DB_WRITE_FAILED } });
  });
});
