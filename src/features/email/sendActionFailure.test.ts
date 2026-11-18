import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { AppError } from "@/constants/errorIds";
import { seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { makeTestDb } from "@/test/db";
import { err, ok } from "@/types/result";
import { sendEmail } from "./actions";
import { seedAgenticMailbox } from "./agentic.test-helpers";
import { FakeGmailClient } from "./gmailFake";
import { type FakeAgenticServer, startFakeAgenticServer } from "./provider/agenticFakeServer";
import { gmailProvider } from "./provider/gmailProvider";
import type * as ResolveProviderModule from "./provider/resolveProvider";
import type { MailProvider } from "./provider/types";
import { seedAccount } from "./send.test-helpers";
import { teamActor } from "./teamMailbox.test-helpers";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
let fake: FakeAgenticServer;
let actor: AuthUser | null = null;
const override = vi.hoisted(() => ({ provider: null as MailProvider | null }));
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
vi.mock("./provider/resolveProvider", async (importOriginal) => {
  const real = await importOriginal<typeof ResolveProviderModule>();
  return {
    resolveProvider: (...a: Parameters<typeof real.resolveProvider>) =>
      override.provider === null
        ? real.resolveProvider(...a)
        : Promise.resolve(ok(override.provider)),
  };
});
beforeAll(async () => {
  ctx = await makeTestDb();
  fake = await startFakeAgenticServer({ mailbox: "media@example.com" });
});
afterEach(() => {
  actor = null;
  override.provider = null;
});
afterAll(async () => {
  await fake.close();
  await ctx.close();
});

const input = (accountId: string) => ({
  accountId,
  idempotencyKey: randomUUID(),
  to: ["jane@acme.com"],
  subject: "Hello",
  bodyHtml: "<p>hello</p>",
});

async function attemptRow(accountId: string) {
  return (
    await ctx.db.execute(
      sql`SELECT status, error_id, send_started_at IS NULL AS unstarted
        FROM email_send_attempts WHERE account_id=${accountId}`,
    )
  ).rows;
}

it("an agentic 422 send returns an error to the composer and keeps the draft", async () => {
  const member = await seedUser(ctx.db);
  const accountId = await seedAgenticMailbox(
    ctx.db,
    { address: fake.mailbox, baseUrl: fake.url, memberIds: [member.id] },
    AbortSignal.timeout(8000),
  );
  actor = teamActor(member.id);
  fake.setNextSend({ kind: "permanent", code: "E_RECIPIENT_NOT_ALLOWED" });

  const r = await sendEmail("csrf", input(accountId));

  expect(r).toEqual({ ok: false, error: { id: "E_AINBOX_006" } });
  expect(await attemptRow(accountId)).toEqual([
    { status: "failed", error_id: "E_AINBOX_006", unstarted: true },
  ]);
});

it("a Gmail 400 send returns the definite failure error", async () => {
  const owner = await seedUser(ctx.db);
  const accountId = await seedAccount(
    ctx.db,
    owner.id,
    AbortSignal.timeout(8000),
    `owner-${randomUUID()}@gunsnation.com`,
  );
  actor = teamActor(owner.id);
  const gmail = new FakeGmailClient();
  gmail.sendImpl = () => err(new AppError("E_GMAIL_003", "send rejected", { status: 400 }));
  override.provider = gmailProvider(gmail);

  const r = await sendEmail("csrf", input(accountId));

  expect(r).toEqual({ ok: false, error: { id: "E_GMAIL_003" } });
  expect(await attemptRow(accountId)).toEqual([
    { status: "failed", error_id: "E_GMAIL_003", unstarted: true },
  ]);
});

it("a Gmail 503 send returns the may-have-been-sent error and keeps the draft", async () => {
  const owner = await seedUser(ctx.db);
  const accountId = await seedAccount(
    ctx.db,
    owner.id,
    AbortSignal.timeout(8000),
    `owner-${randomUUID()}@gunsnation.com`,
  );
  actor = teamActor(owner.id);
  const gmail = new FakeGmailClient();
  gmail.sendImpl = () => err(new AppError("E_GMAIL_001", "send unavailable", { status: 503 }));
  override.provider = gmailProvider(gmail);

  const r = await sendEmail("csrf", input(accountId));

  expect(r).toEqual({ ok: false, error: { id: "E_GMAIL_029" } });
  expect(await attemptRow(accountId)).toEqual([
    { status: "failed", error_id: "E_GMAIL_001", unstarted: false },
  ]);
});

it("a send whose outcome is unknown and re-sent later stays a non-error result", async () => {
  const member = await seedUser(ctx.db);
  const other = await startFakeAgenticServer({ mailbox: `unknown-${randomUUID()}@example.com` });
  const accountId = await seedAgenticMailbox(
    ctx.db,
    { address: other.mailbox, baseUrl: other.url, memberIds: [member.id] },
    AbortSignal.timeout(8000),
  );
  actor = teamActor(member.id);
  other.setNextSend({ kind: "unknown" });

  const r = await sendEmail("csrf", input(accountId));
  await other.close();

  expect(r).toEqual({ ok: true, value: { status: "sending" } });
});
