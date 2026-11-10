import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
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

it("sends once and a replay of a sent row does not re-send", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    const fake = new FakeGmailClient();

    const r1 = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.status).toBe("sent");
    const afterFirst = sendCount(fake);
    expect(afterFirst).toBe(1);

    const r2 = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.status).toBe("sent"); // pure replay
    expect(sendCount(fake)).toBe(afterFirst); // NO second send
  });
});

it("crash-after-accept: a stamped row reconciles via search and never blind re-sends", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    const e = await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    expect(e.ok).toBe(true);
    const attemptId = e.ok ? e.value.attemptId : "";

    await db.execute(sql`
        UPDATE email_send_attempts
        SET status='sending', send_started_at=now(), claimed_at=now()-interval '5 minutes'
        WHERE id=${attemptId}
      `);
    const header = (
      await db.execute(sql`SELECT message_id_header FROM email_send_attempts WHERE id=${attemptId}`)
    ).rows[0] as { message_id_header: string };

    const fake = new FakeGmailClient();
    fake.searchHits.set(header.message_id_header, {
      messages: [{ id: "gmail-found", threadId: "t1" }],
    });

    const r = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("sent");
      expect(r.value.gmailMessageId).toBe("gmail-found");
    }
    expect(sendCount(fake)).toBe(0);
    const row = (
      await db.execute(
        sql`SELECT status, gmail_message_id FROM email_send_attempts WHERE id=${attemptId}`,
      )
    ).rows[0] as { status: string; gmail_message_id: string | null };
    expect(row.status).toBe("sent");
    expect(row.gmail_message_id).toBe("gmail-found");
  });
});

it("moves to needs_review when reconcile finds nothing and the window is exhausted", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    const e = await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    const attemptId = e.ok ? e.value.attemptId : "";
    await db.execute(sql`
        UPDATE email_send_attempts
        SET status='sending', send_started_at=now()-interval '5 minutes', claimed_at=now()-interval '5 minutes'
        WHERE id=${attemptId}
      `);
    const fake = new FakeGmailClient(); // no searchHits -> empty search

    const r = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
      windowMs: 1, // tiny window: the deadline is already in the past
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("needs_review");
    expect(sendCount(fake)).toBe(0); // never blind re-sent during reconcile
    const row = (
      await db.execute(sql`SELECT status, error_id FROM email_send_attempts WHERE id=${attemptId}`)
    ).rows[0] as { status: string; error_id: string | null };
    expect(row.status).toBe("needs_review");
    expect(row.error_id).toBe("E_GMAIL_004");
  });
});
