import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { AppError } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { err, ok } from "@/types/result";
import { FakeStorageClient } from "../files/storageFake";
import { FakeGmailClient } from "./gmailFake";
import { enqueueSend, processSendAttempt } from "./outbox";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const newSignal = (): AbortSignal => new AbortController().signal;

const KEY = "11111111-1111-1111-1111-111111111111";
const payload = {
  to: ["you@y.com"],
  cc: [],
  subject: "Hi",
  html: "<p>hi</p>",
  trackingEnabled: false,
};

async function seedAccount(db: TestDb, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub) VALUES ('o@gunsnation.com','O','sub-o') RETURNING id`,
    )
  ).rows[0] as { id: string };
  signal.throwIfAborted();
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${u.id},'o@gunsnation.com') RETURNING id`,
    )
  ).rows[0] as { id: string };
  signal.throwIfAborted();
  return acct.id;
}

function sendCount(fake: FakeGmailClient): number {
  return fake.calls.filter((c) => c.method === "sendRaw").length;
}

it("marks failed with E_GMAIL_003 on a pre-acceptance 4xx rejection", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    const fake = new FakeGmailClient();
    fake.sendImpl = () => err(new AppError("E_GMAIL_003", "send rejected", {}));

    const r = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("failed");
    const row = (
      await db.execute(
        sql`SELECT status, error_id FROM email_send_attempts WHERE account_id=${acct}`,
      )
    ).rows[0] as { status: string; error_id: string | null };
    expect(row.status).toBe("failed");
    expect(row.error_id).toBe("E_GMAIL_003");
  });
});

it("retries a definite 4xx pre-acceptance rejection instead of reconciling", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    const fake = new FakeGmailClient();
    fake.sendImpl = () => err(new AppError("E_GMAIL_001", "bad request", { status: 400 }));
    const r1 = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.status).toBe("failed");

    fake.sendImpl = () => ok({ id: "sent-2", threadId: "t1" });
    const r2 = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.status).toBe("sent");
    expect(sendCount(fake)).toBe(2);
  });
});

it("does NOT re-send after an ambiguous 5xx failure (reconciles instead)", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    const fake = new FakeGmailClient();
    fake.sendImpl = () => err(new AppError("E_GMAIL_001", "server error", { status: 503 }));
    const r1 = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r1.ok).toBe(true);

    fake.sendImpl = () => ok({ id: "sent-2", threadId: "t1" });
    await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(sendCount(fake)).toBe(1);
  });
});
