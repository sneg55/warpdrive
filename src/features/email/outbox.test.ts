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

it("is idempotent and reports replay for an already-sent row", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    const first = await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.replay).toBe(false);

    const again = await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    expect(again.ok).toBe(true);
    if (first.ok && again.ok) expect(again.value.attemptId).toBe(first.value.attemptId);

    await db.execute(sql`UPDATE email_send_attempts SET status='sent' WHERE account_id=${acct}`);
    const replay = await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.replay).toBe(true);
  });
});

it("sends a reply into the Gmail thread it answers, with RFC 5322 threading headers", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    const thread = (
      await db.execute(
        sql`INSERT INTO email_threads (gmail_thread_id, account_id, subject)
              VALUES ('gt-1', ${acct}, 'Hi') RETURNING id`,
      )
    ).rows[0] as { id: string };
    await db.execute(
      sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, sent_at)
            VALUES (${thread.id}, ${acct}, 'gm-1', 'outbound', 'o@gunsnation.com', now())`,
    );
    await enqueueSend(
      db,
      {
        accountId: acct,
        idempotencyKey: KEY,
        payload,
        threadId: thread.id,
      },
      AbortSignal.timeout(8000),
    );

    const fake = new FakeGmailClient();
    fake.messages.set("gm-1", {
      id: "gm-1",
      threadId: "gt-1",
      labelIds: [],
      payload: { headers: [{ name: "Message-ID", value: "<orig@ex.com>" }] },
    });

    const r = await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });
    expect(r.ok).toBe(true);

    const send = fake.calls.find((c) => c.method === "sendRaw")?.args as {
      rawBase64: string;
      threadId?: string;
    };
    expect(send.threadId).toBe("gt-1");
    const mime = Buffer.from(send.rawBase64, "base64url").toString("utf8");
    expect(mime).toContain("In-Reply-To: <orig@ex.com>");
    expect(mime).toContain("References: <orig@ex.com>");
  });
});

it("sends a fresh compose with no thread id and no threading headers", async () => {
  await withTestDb(async (db) => {
    const acct = await seedAccount(db, newSignal());
    await enqueueSend(
      db,
      { accountId: acct, idempotencyKey: KEY, payload },
      AbortSignal.timeout(8000),
    );
    const fake = new FakeGmailClient();

    await processSendAttempt(db, {
      accountId: acct,
      idempotencyKey: KEY,
      gmail: fake,
      storage: new FakeStorageClient(),
      signal: newSignal(),
    });

    const send = fake.calls.find((c) => c.method === "sendRaw")?.args as {
      rawBase64: string;
      threadId?: string;
    };
    expect(send.threadId).toBeUndefined();
    expect(Buffer.from(send.rawBase64, "base64url").toString("utf8")).not.toContain("In-Reply-To");
  });
});
