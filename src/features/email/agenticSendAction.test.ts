import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { sendEmail } from "./actions";
import { fakeAgenticProvider, seedAgenticMailbox } from "./agentic.test-helpers";
import { syncAgenticMailbox } from "./agenticSync";
import { type FakeAgenticServer, startFakeAgenticServer } from "./provider/agenticFakeServer";
import { teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let fake: FakeAgenticServer;
let actor: AuthUser | null = null;
vi.mock("@/db/client", () => ({
  get db() {
    return ctx.db;
  },
}));
vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf: () => Promise.resolve({ ok: true }),
}));
vi.mock("@/server/trpc/context", () => ({
  createContext: () => Promise.resolve({ actor }),
}));
beforeAll(async () => {
  ctx = await makeTestDb();
  fake = await startFakeAgenticServer({ mailbox: "media@example.com" });
});
afterEach(() => {
  actor = null;
});
afterAll(async () => {
  await fake.close();
  await ctx.close();
});

it("an interactive send from an agentic team mailbox goes through the agentic provider", async () => {
  const signal = AbortSignal.timeout(8000);
  const member = await seedUser(ctx.db);
  const accountId = await seedAgenticMailbox(
    ctx.db,
    { address: fake.mailbox, baseUrl: fake.url, memberIds: [member.id] },
    signal,
  );
  fake.seedEmail({
    id: "sent-1",
    folder: "sent",
    thread_id: "thread-out",
    sender: fake.mailbox,
    recipient: "jane@acme.com",
    subject: "Hello",
    body: "<p>hello</p>",
  });
  actor = teamActor(member.id);

  const r = await sendEmail("csrf", {
    accountId,
    idempotencyKey: randomUUID(),
    to: ["jane@acme.com"],
    subject: "Hello",
    bodyHtml: "<p>hello</p>",
  });

  expect(r).toEqual({ ok: true, value: { status: "sent", messageId: "sent-1" } });
  const attempt = (
    await ctx.db.execute(
      sql`SELECT id, status FROM email_send_attempts WHERE account_id=${accountId}`,
    )
  ).rows[0] as { id: string; status: string };
  expect(attempt.status).toBe("sent");
  expect(fake.deliveries(attempt.id)).toBe(1);

  await ctx.db.execute(sql`UPDATE email_accounts SET provider_cursor=0 WHERE id=${accountId}`);
  const { client, provider } = fakeAgenticProvider(fake);
  expect((await syncAgenticMailbox(ctx.db, { accountId, provider, client, signal })).ok).toBe(true);
  const copies = (
    await ctx.db.execute(sql`SELECT m.direction, t.gmail_thread_id FROM email_messages m
      JOIN email_threads t ON t.id = m.thread_id
      WHERE m.account_id=${accountId} AND m.gmail_message_id='sent-1'`)
  ).rows;
  expect(copies).toEqual([{ direction: "outbound", gmail_thread_id: "thread-out" }]);
});
