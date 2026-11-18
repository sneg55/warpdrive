import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import { seedUser } from "@/db/testing/factories";
import type { TestDb } from "@/test/db";
import { FakeStorageClient } from "../files/storageFake";
import { fakeAgenticProvider, seedAgenticMailbox } from "./agentic.test-helpers";
import { enqueueSend, processSendAttempt } from "./outbox";
import { type FakeAgenticServer, startFakeAgenticServer } from "./provider/agenticFakeServer";
import type { MailProvider } from "./provider/types";

type Db = TestDb["db"];

export interface AgenticSendFixture {
  fake: FakeAgenticServer;
  accountId: string;
  memberId: string;
  provider: MailProvider;
}

export async function startAgenticSendFixture(
  db: Db,
  signal: AbortSignal,
): Promise<AgenticSendFixture> {
  const fake = await startFakeAgenticServer({ mailbox: `media-${randomUUID()}@example.com` });
  const member = await seedUser(db);
  const accountId = await seedAgenticMailbox(
    db,
    { address: fake.mailbox, baseUrl: fake.url, memberIds: [member.id] },
    signal,
  );
  return { fake, accountId, memberId: member.id, provider: fakeAgenticProvider(fake).provider };
}

export function recipients(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `r${i}@acme.com`);
}

export async function enqueueAgentic(
  db: Db,
  f: AgenticSendFixture,
  signal: AbortSignal,
  to: string[] = ["jane@acme.com"],
): Promise<{ attemptId: string; key: string }> {
  const key = randomUUID();
  const r = await enqueueSend(
    db,
    {
      accountId: f.accountId,
      idempotencyKey: key,
      payload: { actorId: f.memberId, to, subject: "Hi", html: "<p>hi</p>" },
    },
    signal,
  );
  if (!r.ok) throw r.error;
  return { attemptId: r.value.attemptId, key };
}

export function runAttempt(
  db: Db,
  f: AgenticSendFixture,
  key: string,
  opts: { provider?: MailProvider; now?: number; signal?: AbortSignal } = {},
) {
  return processSendAttempt(db, {
    accountId: f.accountId,
    idempotencyKey: key,
    provider: opts.provider ?? f.provider,
    storage: new FakeStorageClient(),
    signal: opts.signal ?? AbortSignal.timeout(8000),
    ...(opts.now === undefined ? {} : { now: opts.now }),
  });
}

export interface AttemptState {
  status: string;
  error_id: string | null;
  send_started_at: string | null;
  claim_token: string | null;
  next_attempt_at: string | null;
  gmail_message_id: string | null;
}

export async function attemptState(db: Db, attemptId: string): Promise<AttemptState> {
  const row = (
    await db.execute(sql`SELECT status, error_id, send_started_at, claim_token, next_attempt_at,
      gmail_message_id FROM email_send_attempts WHERE id=${attemptId}`)
  ).rows[0] as AttemptState | undefined;
  if (row === undefined) throw new AppError("E_DB_002", "no attempt row", { attemptId });
  return row;
}

export function crashAfterPost(provider: MailProvider): MailProvider {
  return {
    ...provider,
    async send(a) {
      await provider.send(a);
      throw new AppError("E_DB_002", "worker died after the POST", {});
    },
  };
}

export function sentClientRefs(fake: FakeAgenticServer): (string | undefined)[] {
  return fake.sendBodies().map((b) => b.client_ref);
}
