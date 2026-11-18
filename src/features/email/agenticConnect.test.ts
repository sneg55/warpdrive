import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { connectAgenticMailbox, reconnectAgenticMailbox } from "./agenticConnectCore";
import { softDisconnectMailbox } from "./disconnect";
import { decryptAgenticCredentials } from "./provider/agenticCredentials";
import { type FakeAgenticServer, startFakeAgenticServer } from "./provider/agenticFakeServer";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let fake: FakeAgenticServer;
const enqueue = { sync: vi.fn(() => Promise.resolve()), backfill: vi.fn(() => Promise.resolve()) };
beforeAll(async () => {
  ctx = await makeTestDb();
  fake = await startFakeAgenticServer({ mailbox: "media@example.com" });
});
afterAll(async () => {
  await fake.close();
  await ctx.close();
});
beforeEach(() => {
  fake.setCapabilities({ warpdrive: 1 });
  fake.setAuthMode("ok");
  enqueue.sync.mockClear();
  enqueue.backfill.mockClear();
});

async function admin(isAdmin = true) {
  return seedUser(ctx.db, { isAdmin });
}
const input = (over: Partial<Parameters<typeof connectAgenticMailbox>[1]> = {}) => ({
  enabled: true,
  actorId: "",
  baseUrl: fake.url,
  address: fake.mailbox,
  clientId: "cid",
  clientSecret: "csecret",
  displayName: "Media",
  backfillDays: 90,
  ...over,
});
const connect = (over: Partial<Parameters<typeof connectAgenticMailbox>[1]>) =>
  connectAgenticMailbox(ctx.db, input(over), enqueue, AbortSignal.timeout(8000));
const rowsFor = async (address: string) =>
  (await ctx.db.execute(sql`SELECT * FROM email_accounts WHERE email_address=${address}`)).rows;

it("flag off returns PERM_DENIED", async () => {
  const user = await admin();
  const r = await connect({ enabled: false, actorId: user.id });
  expect(r.ok ? null : r.error.id).toBe("E_PERM_001");
  expect(await rowsFor(fake.mailbox)).toHaveLength(0);
});

it("a non-admin is denied", async () => {
  const user = await admin(false);
  const r = await connect({ actorId: user.id });
  expect(r.ok ? null : r.error.id).toBe("E_PERM_006");
  expect(await rowsFor(fake.mailbox)).toHaveLength(0);
});

it("a stock worker (no marker) returns E_AINBOX_002 and stores nothing", async () => {
  const user = await admin();
  fake.setCapabilities({ other: true });
  const r = await connect({ actorId: user.id });
  expect(r.ok ? null : r.error.id).toBe("E_AINBOX_002");
  expect(await rowsFor(fake.mailbox)).toHaveLength(0);
});

it("bad credentials return E_AINBOX_001 and store nothing", async () => {
  const user = await admin();
  fake.setAuthMode("forbidden");
  const r = await connect({ actorId: user.id });
  expect(r.ok ? null : r.error.id).toBe("E_AINBOX_001");
  expect(await rowsFor(fake.mailbox)).toHaveLength(0);
  expect(enqueue.sync).not.toHaveBeenCalled();
});

it("an address used by a Gmail mailbox is rejected", async () => {
  const user = await admin();
  await ctx.db.execute(
    sql`INSERT INTO email_accounts (kind, email_address) VALUES ('team', 'gmailteam@example.com')`,
  );
  const r = await connect({ actorId: user.id, address: "GmailTeam@example.com " });
  expect(r.ok ? null : r.error.id).toBe("E_GMAIL_027");
  const rows = await rowsFor("gmailteam@example.com");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.provider).toBe("gmail");
});

it("success stores encrypted credentials that decrypt to the input and never returns the secret", async () => {
  const user = await admin();
  const r = await connect({ actorId: user.id, address: ` ${fake.mailbox.toUpperCase()} ` });
  expect(r.ok).toBe(true);
  expect(JSON.stringify(r)).not.toContain("csecret");
  const row = (await rowsFor(fake.mailbox))[0] as {
    id: string;
    kind: string;
    provider: string;
    provider_base_url: string;
    provider_credentials_enc: Buffer;
    backfill_days: number;
    status: string;
    connected_by_user_id: string;
    display_name: string;
  };
  expect(row).toMatchObject({
    kind: "team",
    provider: "agentic_inbox",
    provider_base_url: fake.url,
    backfill_days: 90,
    status: "connected",
    connected_by_user_id: user.id,
    display_name: "Media",
  });
  expect(decryptAgenticCredentials(row.provider_credentials_enc)).toEqual({
    ok: true,
    value: { clientId: "cid", clientSecret: "csecret" },
  });
  const member = await ctx.db.execute(
    sql`SELECT 1 FROM email_account_members WHERE account_id=${row.id} AND user_id=${user.id}`,
  );
  expect(member.rows).toHaveLength(1);
  expect(enqueue.sync).toHaveBeenCalledWith(row.id);
  expect(enqueue.backfill).toHaveBeenCalledWith(row.id);
});

it("a zero backfill window enqueues no backfill", async () => {
  const user = await admin();
  const other = await startFakeAgenticServer({ mailbox: "zero@example.com" });
  const r = await connect({
    actorId: user.id,
    baseUrl: other.url,
    address: other.mailbox,
    backfillDays: 0,
  });
  await other.close();
  expect(r.ok).toBe(true);
  expect(enqueue.sync).toHaveBeenCalledTimes(1);
  expect(enqueue.backfill).not.toHaveBeenCalled();
});

it("reconnect resets an errored mailbox to active", async () => {
  const user = await admin();
  const other = await startFakeAgenticServer({ mailbox: "again@example.com" });
  const created = await connect({
    actorId: user.id,
    baseUrl: other.url,
    address: other.mailbox,
  });
  if (!created.ok) throw new Error("connect failed");
  const accountId = created.value.accountId;
  await ctx.db.execute(
    sql`UPDATE email_accounts SET status='error', last_error_id='E_AINBOX_001' WHERE id=${accountId}`,
  );
  const reconnect = (clientSecret: string) =>
    reconnectAgenticMailbox(
      ctx.db,
      { enabled: true, actorId: user.id, accountId, clientId: "cid2", clientSecret },
      enqueue,
      AbortSignal.timeout(8000),
    );
  other.setAuthMode("forbidden");
  const bad = await reconnect("wrong");
  expect(bad.ok ? null : bad.error.id).toBe("E_AINBOX_001");
  expect((await rowsFor(other.mailbox))[0]?.status).toBe("error");
  other.setAuthMode("ok");
  const good = await reconnect("fresh");
  await other.close();
  expect(good.ok).toBe(true);
  const row = (await rowsFor(other.mailbox))[0] as {
    status: string;
    last_error_id: string | null;
    provider_credentials_enc: Buffer;
  };
  expect(row.status).toBe("connected");
  expect(row.last_error_id).toBeNull();
  expect(decryptAgenticCredentials(row.provider_credentials_enc)).toEqual({
    ok: true,
    value: { clientId: "cid2", clientSecret: "fresh" },
  });
});

it("reconnect refuses a Gmail mailbox", async () => {
  const user = await admin();
  const id = (
    await ctx.db.execute(
      sql`INSERT INTO email_accounts (kind, email_address) VALUES ('team', 'g2@example.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  const r = await reconnectAgenticMailbox(
    ctx.db,
    { enabled: true, actorId: user.id, accountId: id.id, clientId: "a", clientSecret: "b" },
    enqueue,
    AbortSignal.timeout(8000),
  );
  expect(r.ok ? null : r.error.id).toBe("E_AINBOX_003");
});

it("disconnect clears the credentials", async () => {
  const user = await admin();
  const other = await startFakeAgenticServer({ mailbox: "gone@example.com" });
  const created = await connect({
    actorId: user.id,
    baseUrl: other.url,
    address: other.mailbox,
  });
  await other.close();
  if (!created.ok) throw new Error("connect failed");
  await softDisconnectMailbox(ctx.db, created.value.accountId, AbortSignal.timeout(8000));
  const row = (await rowsFor(other.mailbox))[0] as {
    status: string;
    provider_credentials_enc: Buffer | null;
  };
  expect(row.status).toBe("disconnected");
  expect(row.provider_credentials_enc).toBeNull();
});
