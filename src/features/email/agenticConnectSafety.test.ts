import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { connectAgenticMailbox, reconnectAgenticMailbox } from "./agenticConnectCore";
import { agenticConnectMessage } from "./agenticConnectMessages";
import { decryptToken } from "./crypto";
import { type FakeAgenticServer, startFakeAgenticServer } from "./provider/agenticFakeServer";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const servers: FakeAgenticServer[] = [];
const enqueue = { sync: vi.fn(() => Promise.resolve()), backfill: vi.fn(() => Promise.resolve()) };
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
  await ctx.close();
});

async function server(): Promise<FakeAgenticServer> {
  const s = await startFakeAgenticServer({ mailbox: `box-${randomUUID()}@example.com` });
  servers.push(s);
  return s;
}

async function connect(actorId: string, fake: FakeAgenticServer) {
  return connectAgenticMailbox(
    ctx.db,
    {
      enabled: true,
      actorId,
      baseUrl: fake.url,
      address: fake.mailbox,
      clientId: "cid",
      clientSecret: "csecret",
      displayName: "Media",
      backfillDays: 0,
    },
    enqueue,
    AbortSignal.timeout(8000),
  );
}

function reconnect(actorId: string, accountId: string) {
  return reconnectAgenticMailbox(
    ctx.db,
    { enabled: true, actorId, accountId, clientId: "cid2", clientSecret: "fresh" },
    enqueue,
    AbortSignal.timeout(8000),
  );
}

async function storedCredentialKeys(address: string): Promise<string[]> {
  const row = (
    await ctx.db.execute(
      sql`SELECT provider_credentials_enc FROM email_accounts WHERE email_address=${address}`,
    )
  ).rows[0] as { provider_credentials_enc: Buffer };
  const plain = decryptToken(row.provider_credentials_enc);
  if (!plain.ok) throw plain.error;
  return Object.keys(JSON.parse(plain.value) as Record<string, unknown>).sort();
}

it("connect and reconnect encrypt only the client id and secret", async () => {
  const user = await seedUser(ctx.db, { isAdmin: true });
  const fake = await server();
  const created = await connect(user.id, fake);
  if (!created.ok) throw created.error;
  expect(await storedCredentialKeys(fake.mailbox)).toEqual(["clientId", "clientSecret"]);

  expect((await reconnect(user.id, created.value.accountId)).ok).toBe(true);
  expect(await storedCredentialKeys(fake.mailbox)).toEqual(["clientId", "clientSecret"]);
});

it("a failure in the member insert leaves no account row", async () => {
  enqueue.sync.mockClear();
  const user = await seedUser(ctx.db, { isAdmin: true });
  const fake = await server();
  await ctx.db.execute(
    sql.raw(`
    CREATE FUNCTION fail_member_insert() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'member insert forced to fail'; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER fail_member BEFORE INSERT ON email_account_members
      FOR EACH ROW EXECUTE FUNCTION fail_member_insert();
  `),
  );
  try {
    await expect(connect(user.id, fake)).rejects.toThrow();
  } finally {
    await ctx.db.execute(
      sql.raw(`
      DROP TRIGGER fail_member ON email_account_members;
      DROP FUNCTION fail_member_insert();
    `),
    );
  }
  const rows = await ctx.db.execute(
    sql`SELECT 1 FROM email_accounts WHERE email_address=${fake.mailbox}`,
  );
  expect(rows.rows).toHaveLength(0);
  expect(enqueue.sync).not.toHaveBeenCalled();
});

it("reconnect for a missing or non-agentic mailbox returns E_AINBOX_003 with its own copy", async () => {
  const user = await seedUser(ctx.db, { isAdmin: true });
  const gmail = (
    await ctx.db.execute(
      sql`INSERT INTO email_accounts (kind, email_address) VALUES ('team', ${`g-${randomUUID()}@example.com`}) RETURNING id`,
    )
  ).rows[0] as { id: string };

  for (const accountId of [randomUUID(), gmail.id]) {
    const r = await reconnect(user.id, accountId);
    expect(r.ok ? null : r.error.id).toBe("E_AINBOX_003");
  }
  expect(agenticConnectMessage("E_AINBOX_003")).not.toMatch(/Connecting failed/);
});
